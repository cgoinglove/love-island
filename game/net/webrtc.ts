"use client";

import {
  type DecodedPose,
  decodePose,
  encodePose,
  POSE_BYTES,
} from "./poseCodec";

/**
 * 브라우저끼리 직접 좌표를 주고받는 P2P 메시.
 *
 * 서버(Vercel)는 **악수할 때만** 쓴다. offer/answer/ICE 후보를 서로 전달해주고 나면
 * 그 뒤 좌표는 서버를 거치지 않는다 — 지연이 왕복 한 번으로 줄고 서버 호출이 0 이 된다.
 *
 * 안 뚫리는 경우가 있다: symmetric NAT 뒤(모바일 통신망·회사망)에서는 STUN 만으로
 * 부족하고 TURN 릴레이가 필요한데 그건 대역폭 비용이라 안 뒀다.
 * 그래서 **실패해도 조용히 넘어간다** — presence 폴링이 폴백으로 계속 돌고 있다.
 */

const ICE_SERVERS: RTCIceServer[] = [
  // 공개 STUN. 내 공인 주소를 알아내는 데만 쓰이고 데이터는 지나가지 않는다.
  { urls: ["stun:stun.l.google.com:19302", "stun:stun1.l.google.com:19302"] },
];

export type SignalKind = "offer" | "answer" | "ice";

/**
 * DataChannel 첫 바이트는 메시지 종류다.
 * 좌표는 초당 20번 오는 6바이트짜리이고, 사건은 가끔 오는 JSON 이라
 * 채널을 두 개 파는 대신 태그 한 바이트로 구분한다.
 */
const TAG_POSE = 0;
const TAG_EVENT = 1;

export interface RtcCallbacks {
  /** 상대 좌표가 도착했을 때. */
  onPose(playerId: string, pose: DecodedPose): void;
  /** 채팅·밀치기·이모트가 도착했을 때. JSON 문자열 그대로 넘긴다. */
  onEvent(playerId: string, json: string): void;
  /** 시그널링 메시지를 서버 우편함에 넣어달라는 요청. */
  onSignal(to: string, kind: SignalKind, payload: string): void;
}

interface PeerLink {
  connection: RTCPeerConnection;
  channel: RTCDataChannel | null;
  /** 원격 description 이 붙기 전에 도착한 ICE 후보를 잠시 담아둔다. */
  pendingCandidates: RTCIceCandidateInit[];
}

export interface RtcMesh {
  /** 새로 보이는 사람과 연결을 시작한다. 이미 있으면 아무 일도 안 한다. */
  ensurePeer(playerId: string): void;
  removePeer(playerId: string): void;
  handleSignal(from: string, kind: SignalKind, payload: string): void;
  /** 연결된 모든 사람에게 내 좌표를 뿌린다. */
  broadcastPose(x: number, z: number, yaw: number): void;
  /** 연결된 모든 사람에게 사건을 뿌린다. 서버로도 같이 가므로 실패해도 괜찮다. */
  broadcastEvent(json: string): void;
  isConnected(playerId: string): boolean;
  connectedCount(): number;
  close(): void;
}

export function createRtcMesh(myId: string, callbacks: RtcCallbacks): RtcMesh {
  const links = new Map<string, PeerLink>();
  const poseFrame = new Uint8Array(1 + POSE_BYTES);
  const poseView = new DataView(poseFrame.buffer, 1);
  const encoder = new TextEncoder();
  const incoming: DecodedPose = { x: 0, z: 0, yaw: 0 };

  /**
   * 누가 먼저 offer 를 보낼지 id 로 정한다.
   * 양쪽이 동시에 offer 를 만들면 협상이 꼬인다(glare). 규칙을 하나 정해두면
   * perfect negotiation 같은 복잡한 장치 없이 끝난다.
   */
  const isInitiator = (peerId: string) => myId < peerId;

  function createLink(peerId: string): PeerLink {
    const connection = new RTCPeerConnection({ iceServers: ICE_SERVERS });
    const link: PeerLink = { connection, channel: null, pendingCandidates: [] };
    links.set(peerId, link);

    connection.onicecandidate = (event) => {
      if (!event.candidate) return;
      callbacks.onSignal(
        peerId,
        "ice",
        JSON.stringify(event.candidate.toJSON()),
      );
    };

    connection.onconnectionstatechange = () => {
      const state = connection.connectionState;
      // 실패해도 재시도하지 않는다. 폴링 폴백이 이미 좌표를 나르고 있고,
      // 계속 재협상하면 뚫리지 않는 네트워크에서 무한 루프가 된다.
      if (state === "failed" || state === "closed") closeLink(peerId);
    };

    if (isInitiator(peerId)) {
      // 좌표는 순서도 재전송도 필요 없다 — 늦게 온 좌표는 어차피 버려진다.
      // ordered:false + maxRetransmits:0 이면 사실상 UDP 다.
      const channel = connection.createDataChannel("pose", {
        ordered: false,
        maxRetransmits: 0,
      });
      attachChannel(peerId, link, channel);
      void negotiate(peerId, link);
    } else {
      connection.ondatachannel = (event) =>
        attachChannel(peerId, link, event.channel);
    }

    return link;
  }

  function attachChannel(
    peerId: string,
    link: PeerLink,
    channel: RTCDataChannel,
  ): void {
    channel.binaryType = "arraybuffer";
    channel.onmessage = (event) => {
      const data = event.data;
      if (!(data instanceof ArrayBuffer) || data.byteLength < 1) return;
      const bytes = new Uint8Array(data);
      if (bytes[0] === TAG_POSE) {
        if (data.byteLength < 1 + POSE_BYTES) return;
        decodePose(new DataView(data, 1), incoming);
        callbacks.onPose(peerId, incoming);
        return;
      }
      if (bytes[0] === TAG_EVENT) {
        callbacks.onEvent(peerId, new TextDecoder().decode(bytes.subarray(1)));
      }
    };
    channel.onclose = () => {
      if (link.channel === channel) link.channel = null;
    };
    link.channel = channel;
  }

  async function negotiate(peerId: string, link: PeerLink): Promise<void> {
    try {
      const offer = await link.connection.createOffer();
      await link.connection.setLocalDescription(offer);
      callbacks.onSignal(peerId, "offer", JSON.stringify(offer));
    } catch {
      closeLink(peerId);
    }
  }

  async function applyPendingCandidates(link: PeerLink): Promise<void> {
    for (const candidate of link.pendingCandidates) {
      await link.connection.addIceCandidate(candidate).catch(() => {});
    }
    link.pendingCandidates.length = 0;
  }

  function closeLink(peerId: string): void {
    const link = links.get(peerId);
    if (!link) return;
    link.channel?.close();
    link.connection.close();
    links.delete(peerId);
  }

  return {
    ensurePeer(peerId) {
      if (peerId === myId || links.has(peerId)) return;
      createLink(peerId);
    },

    removePeer(peerId) {
      closeLink(peerId);
    },

    handleSignal(from, kind, payload) {
      void (async () => {
        try {
          const link = links.get(from) ?? createLink(from);
          const parsed: unknown = JSON.parse(payload);

          if (kind === "offer") {
            await link.connection.setRemoteDescription(
              parsed as RTCSessionDescriptionInit,
            );
            await applyPendingCandidates(link);
            const answer = await link.connection.createAnswer();
            await link.connection.setLocalDescription(answer);
            callbacks.onSignal(from, "answer", JSON.stringify(answer));
            return;
          }

          if (kind === "answer") {
            await link.connection.setRemoteDescription(
              parsed as RTCSessionDescriptionInit,
            );
            await applyPendingCandidates(link);
            return;
          }

          // ICE 후보가 description 보다 먼저 도착하는 건 흔한 일이다. 모아뒀다 나중에 넣는다.
          const candidate = parsed as RTCIceCandidateInit;
          if (link.connection.remoteDescription === null) {
            link.pendingCandidates.push(candidate);
          } else {
            await link.connection.addIceCandidate(candidate).catch(() => {});
          }
        } catch {
          // 협상 실패는 조용히 넘긴다. 폴링이 계속 돌고 있다.
          closeLink(from);
        }
      })();
    },

    broadcastPose(x, z, yaw) {
      let encoded = false;
      for (const link of links.values()) {
        if (link.channel?.readyState !== "open") continue;
        if (!encoded) {
          poseFrame[0] = TAG_POSE;
          encodePose(poseView, x, z, yaw);
          encoded = true;
        }
        // 버퍼가 밀렸으면 건너뛴다. 오래된 좌표를 쌓아 보내봐야 지연만 늘어난다.
        if (link.channel.bufferedAmount > POSE_BYTES * 32) continue;
        try {
          link.channel.send(poseFrame);
        } catch {
          // 닫히는 중일 수 있다. 다음 프레임에 정리된다.
        }
      }
    },

    broadcastEvent(json) {
      const body = encoder.encode(json);
      const frame = new Uint8Array(1 + body.length);
      frame[0] = TAG_EVENT;
      frame.set(body, 1);
      for (const link of links.values()) {
        if (link.channel?.readyState !== "open") continue;
        try {
          link.channel.send(frame);
        } catch {
          // 서버로도 같은 사건이 가므로 여기서 실패해도 유실되지 않는다.
        }
      }
    },

    isConnected(peerId) {
      return links.get(peerId)?.channel?.readyState === "open";
    },

    connectedCount() {
      let count = 0;
      for (const link of links.values()) {
        if (link.channel?.readyState === "open") count++;
      }
      return count;
    },

    close() {
      for (const peerId of [...links.keys()]) closeLink(peerId);
    },
  };
}
