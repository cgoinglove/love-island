"use client";

import { create } from "zustand";
import {
  NICKNAME_STORAGE_KEY,
  PLAYER_ID_STORAGE_KEY,
  ROOM_ISLAND,
} from "@/shared/constants";
import {
  type OutgoingRoomEvent,
  type OutgoingSignal,
  PRESENCE_ACTIVE_INTERVAL_MS,
  PRESENCE_IDLE_INTERVAL_MS,
  presenceResponse,
  type RoomEventKind,
  RTC_POSE_INTERVAL_MS,
  roomEvent as roomEventSchema,
} from "@/shared/presence";
import { nextBeatDelay } from "./beatRate";
import {
  lastSnapshotTime,
  type Pose,
  pushSnapshot,
  type Snapshot,
} from "./interpolation";
import { logSummary } from "./netLog";
import { handleRoomEvent, reflectOwnEvent } from "./roomEvents";
import { noteServerTime } from "./serverClock";
import { createRtcMesh } from "./webrtc";

/**
 * 접속자 위치 교환. 두 개의 통로를 함께 쓴다.
 *
 *  ① WebRTC DataChannel — 브라우저끼리 직접. 20Hz, 지연 30~80ms, 서버 비용 0
 *  ② HTTP 폴링 (presence 엔드포인트) — 발견 · 악수 중계 · **P2P 실패 시 폴백**
 *
 * ②가 없으면 symmetric NAT 뒤에 있는 방문자는 서로 안 보인다(TURN 릴레이를 안 뒀다).
 * ①이 없으면 걷는 사람 1명당 초당 5회의 서버 호출이 계속 나간다. 둘 다 두는 게 요점이다.
 *
 * 어느 쪽으로 들어오든 좌표는 같은 스냅샷 버퍼에 쌓인다 —
 * 렌더링 쪽은 통로가 뭔지 알 필요가 없고, 그래서 강등이 저절로 매끄럽다.
 */

export interface Peer {
  readonly playerId: string;
  nickname: string | null;
  readonly buffer: Snapshot[];
  readonly pose: Pose;
  /** P2P 로 연결됐는가. 보간 지연을 고르는 데 쓴다. */
  direct: boolean;
}

/**
 * 리렌더를 유발하면 안 되는 데이터라 스토어 밖의 평범한 Map 에 둔다.
 * 좌표는 초당 20번 바뀌고 매 프레임 읽힌다 — React 가 알 필요가 없다. (기획서 §4.1)
 */
const peers = new Map<string, Peer>();

export function getPeers(): ReadonlyMap<string, Peer> {
  return peers;
}

export interface PeerSummary {
  playerId: string;
  nickname: string | null;
}

interface PresenceState {
  /**
   * 누가 들어오고 나가고, 이름이 바뀔 때만 갱신된다 = 리렌더가 드물다.
   * 좌표는 절대 여기 안 들어온다. (기획서 §4.1)
   */
  peerList: PeerSummary[];
  /** 나를 포함한 접속자 수. */
  online: number;
  /** P2P 로 직접 연결된 사람 수. 지금 어느 통로를 쓰는지 HUD 에 보여준다. */
  direct: number;
  setPeerList(list: PeerSummary[]): void;
  setDirect(count: number): void;
}

export const usePresenceStore = create<PresenceState>()((set) => ({
  peerList: [],
  online: 1,
  direct: 0,
  setPeerList: (peerList) => set({ peerList, online: peerList.length + 1 }),
  setDirect: (direct) => set({ direct }),
}));

export interface SelfSnapshot {
  x: number;
  z: number;
  yaw: number;
  /** 지면 위 높이(m). 점프와 넉백이 남의 화면에도 보이려면 이게 있어야 한다. */
  y: number;
}

/** 이 탭의 신원. sessionStorage 라 탭을 새로 열면 다른 사람으로 잡힌다. */
function getPlayerId(): string {
  const stored = sessionStorage.getItem(PLAYER_ID_STORAGE_KEY);
  if (stored) return stored;
  const created = `p_${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`;
  sessionStorage.setItem(PLAYER_ID_STORAGE_KEY, created);
  return created;
}

/**
 * 지금 돌고 있는 루프의 사건 발신 함수.
 * UI(채팅창·밀치기 버튼)는 루프의 내부를 모르고 이것만 부른다.
 */
let activeEmitter: ((kind: RoomEventKind, text: string) => void) | null = null;

export function emitRoomEvent(kind: RoomEventKind, text: string): void {
  activeEmitter?.(kind, text);
}

export function getMyPlayerId(): string {
  return getPlayerId();
}

function safeJson(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

/** 응답에 이 시간 동안 안 보이면 화면에서 지운다. 잠깐의 패킷 유실은 견디는 길이. */
const PEER_DROP_MS = 2500;

/** 접속 상태 요약을 콘솔에 찍는 간격(ms). */
const SUMMARY_INTERVAL_MS = 10_000;

function ensurePeer(playerId: string, nickname: string | null): Peer {
  let peer = peers.get(playerId);
  if (!peer) {
    peer = {
      playerId,
      nickname,
      buffer: [],
      pose: { x: 0, z: 0, yaw: 0, y: 0 },
      direct: false,
    };
    peers.set(playerId, peer);
  }
  return peer;
}

/**
 * 위치 교환을 시작한다.
 * @param getSelf 현재 내 위치를 돌려주는 함수. 아직 준비 안 됐으면 null
 * @returns 정리 함수
 */
export function startPresence(getSelf: () => SelfSnapshot | null): () => void {
  const playerId = getPlayerId();
  let stopped = false;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let failures = 0;

  /** 다음 beat 에 실어 보낼 악수 메시지. */
  const outbox: OutgoingSignal[] = [];
  /** 다음 beat 에 실어 보낼 방 사건. P2P 로는 이미 즉시 나간다. */
  const eventOutbox: OutgoingRoomEvent[] = [];
  /** 마지막으로 본 사건 순번. */
  let cursor = 0;
  /** 마지막 요약을 찍은 시각. 상태가 아니라 **주기**로 찍는다 — 콘솔을 안 더럽히려고. */
  let lastSummaryAt = 0;

  const mesh = createRtcMesh(playerId, {
    onPose(peerId, pose) {
      const peer = peers.get(peerId);
      if (!peer) return;
      peer.direct = true;
      pushSnapshot(peer.buffer, {
        t: performance.now(),
        x: pose.x,
        z: pose.z,
        yaw: pose.yaw,
        y: pose.y,
      });
    },
    onEvent(_peerId, json) {
      // P2P 가 먼저 도착한다. 서버로도 같은 사건이 오지만 id 로 걸러진다.
      const parsed = roomEventSchema.safeParse(safeJson(json));
      if (parsed.success) handleRoomEvent(parsed.data, playerId);
    },
    onSignal(to, kind, payload) {
      outbox.push({ to, kind, payload });
      flushSoon();
    },
  });

  /** 악수 메시지가 생기면 다음 주기를 기다리지 않고 바로 내보낸다. */
  function flushSoon(): void {
    if (stopped) return;
    if (timer !== null) clearTimeout(timer);
    timer = setTimeout(beat, 30);
  }

  const schedule = (delay: number) => {
    if (stopped) return;
    timer = setTimeout(beat, delay);
  };

  /** 다음 폴링까지의 간격. 판단은 순수 함수에 있다(beatRate.ts). */
  function nextDelay(handshaking: boolean): number {
    let relaying = false;
    for (const peer of peers.values()) {
      if (!peer.direct) {
        relaying = true;
        break;
      }
    }
    return nextBeatDelay({
      handshaking,
      pending: outbox.length > 0 || eventOutbox.length > 0,
      relaying,
    });
  }

  function applyPeers(
    incoming: Array<{
      playerId: string;
      nickname: string | null;
      x: number;
      z: number;
      yaw: number;
      y: number;
    }>,
  ): void {
    const now = performance.now();
    const seen = new Set<string>();

    for (const entry of incoming) {
      seen.add(entry.playerId);
      const peer = ensurePeer(entry.playerId, entry.nickname);
      peer.nickname = entry.nickname;
      mesh.ensurePeer(entry.playerId);

      // P2P 가 붙어 있으면 폴링 좌표는 무시한다. 20Hz 로 오는 것 사이에
      // 5Hz 짜리 오래된 값을 끼워 넣으면 오히려 끊겨 보인다.
      if (mesh.isConnected(entry.playerId)) continue;
      peer.direct = false;
      // 서버 시각이 아니라 **수신 시각**으로 찍는다. 시계 동기화 문제가 통째로 사라진다.
      pushSnapshot(peer.buffer, {
        t: now,
        x: entry.x,
        z: entry.z,
        yaw: entry.yaw,
        y: entry.y,
      });
    }

    /**
     * 응답에 없으면 나간 것으로 본다.
     * 서버가 이미 TTL 로 걸러낸 목록이므로 여기서 또 TTL 을 기다리면
     * 퇴장이 반영되기까지 두 배(24초)가 걸린다. 응답 몇 번 정도만 참는다.
     */
    for (const [id, peer] of peers) {
      if (seen.has(id)) continue;
      if (now - lastSnapshotTime(peer.buffer) > PEER_DROP_MS) {
        mesh.removePeer(id);
        peers.delete(id);
      }
    }

    // 목록이 실제로 바뀌었을 때만 스토어를 건드린다 = 리렌더가 드물다.
    // 닉네임까지 시그니처에 넣어야 이름표가 갱신된다 — 이걸 빼먹으면
    // 처음 잡힌 이름(대개 null → "손님")이 영원히 남는다.
    const next = [...peers.values()]
      .map((peer) => ({ playerId: peer.playerId, nickname: peer.nickname }))
      .sort((left, right) => left.playerId.localeCompare(right.playerId));
    const current = usePresenceStore.getState().peerList;
    const changed =
      next.length !== current.length ||
      next.some(
        (peer, i) =>
          peer.playerId !== current[i]?.playerId ||
          peer.nickname !== current[i]?.nickname,
      );
    if (changed) usePresenceStore.getState().setPeerList(next);

    const direct = mesh.connectedCount();
    if (direct !== usePresenceStore.getState().direct) {
      usePresenceStore.getState().setDirect(direct);
    }
  }

  async function beat(): Promise<void> {
    if (stopped) return;

    // 탭이 백그라운드면 아무것도 보내지 않는다. 보이지도 않는 화면 때문에
    // 서버를 두드릴 이유가 없고, DB 행도 TTL 로 알아서 사라진다.
    if (document.visibilityState !== "visible") {
      schedule(PRESENCE_IDLE_INTERVAL_MS);
      return;
    }

    const self = getSelf();
    if (self === null) {
      schedule(PRESENCE_ACTIVE_INTERVAL_MS);
      return;
    }

    // 이번 요청에 실어 보낼 악수 메시지와 사건을 꺼내 간다.
    const signals = outbox.splice(0, outbox.length);
    const events = eventOutbox.splice(0, eventOutbox.length);

    const sentAt = performance.now();
    try {
      const response = await fetch("/api/presence", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          playerId,
          room: ROOM_ISLAND,
          nickname: localStorage.getItem(NICKNAME_STORAGE_KEY),
          x: self.x,
          z: self.z,
          yaw: self.yaw,
          y: self.y,
          signals,
          events,
          cursor,
        }),
      });
      if (!response.ok) throw new Error(String(response.status));

      /**
       * 이 응답의 Date 헤더가 곧 서버 시각이다. 낮밤 주기를 epoch 로 돌리므로
       * 시계가 틀어진 기기는 혼자 다른 시간대를 보게 되는데, 이미 오가는 요청에
       * 얹어 가면 통신을 하나도 안 늘리고 맞출 수 있다.
       */
      noteServerTime(response.headers.get("date"));

      const body = presenceResponse.parse(await response.json());
      applyPeers(body.peers);
      for (const message of body.signals) {
        mesh.handleSignal(message.from, message.kind, message.payload);
      }
      for (const event of body.events) handleRoomEvent(event, playerId);
      cursor = Math.max(cursor, body.cursor);

      failures = 0;
      const delay = nextDelay(body.signals.length > 0);

      /**
       * 10초에 한 번 요약. 아무도 없으면 안 찍는다.
       * 숫자 셋이 함께 있어야 진단이 된다 — 사람이 있는데 폴링 주기가 200ms 라면
       * 그건 폴백으로 돌고 있다는 뜻이고, 3000ms 라면 좌표가 P2P 로 가고 있다는 뜻이다.
       */
      const now = performance.now();
      if (peers.size > 0 && now - lastSummaryAt > SUMMARY_INTERVAL_MS) {
        lastSummaryAt = now;
        logSummary({
          peers: peers.size,
          direct: mesh.connectedCount(),
          intervalMs: delay,
          rttMs: Math.round(now - sentAt),
        });
      }

      schedule(delay);
    } catch {
      // 보내지 못한 것들은 되돌려 놓는다. 악수를 잃으면 연결이 영영 안 붙는다.
      outbox.unshift(...signals);
      eventOutbox.unshift(...events);
      failures++;
      // 지수 백오프 + 지터. 서버가 죽었을 때 모든 클라이언트가 동시에 재시도하면
      // 살아나는 순간 다시 죽는다. (기획서 §5.4)
      const backoff = Math.min(1000 * 2 ** failures, 30_000);
      schedule(backoff * (0.5 + Math.random() * 0.5));
    }
  }

  // P2P 좌표 송신. 서버를 안 거치므로 폴링과 무관하게 빠르게 돈다.
  const poseTimer = setInterval(() => {
    if (document.visibilityState !== "visible") return;
    const self = getSelf();
    if (self === null) return;
    mesh.broadcastPose(self.x, self.z, self.yaw, self.y);
  }, RTC_POSE_INTERVAL_MS);

  const onVisible = () => {
    if (document.visibilityState !== "visible") return;
    // 돌아오면 기다리지 않고 바로 한 번 보낸다.
    if (timer !== null) clearTimeout(timer);
    void beat();
  };

  const onLeave = () => {
    // keepalive 를 붙여야 탭이 닫히는 중에도 요청이 살아남는다.
    void fetch(`/api/presence?playerId=${encodeURIComponent(playerId)}`, {
      method: "DELETE",
      keepalive: true,
    }).catch(() => {});
  };

  /**
   * 사건을 내보낸다. P2P 로 즉시 뿌리고, 서버로도 같이 보낸다.
   * 두 경로로 가는 이유는 P2P 가 안 붙은 상대에게도 닿아야 하기 때문이고,
   * 중복은 받는 쪽이 id 로 걸러낸다.
   */
  activeEmitter = (kind, text) => {
    const self = getSelf();
    if (self === null) return;
    const event: OutgoingRoomEvent = {
      id: `e_${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`,
      kind,
      text,
      x: self.x,
      z: self.z,
      yaw: self.yaw,
    };
    const full = {
      ...event,
      from: playerId,
      nickname: localStorage.getItem(NICKNAME_STORAGE_KEY),
      seq: 0,
    };
    mesh.broadcastEvent(JSON.stringify(full));
    eventOutbox.push(event);
    reflectOwnEvent(event, playerId);
    flushSoon();
  };

  document.addEventListener("visibilitychange", onVisible);
  window.addEventListener("pagehide", onLeave);
  void beat();

  return () => {
    stopped = true;
    activeEmitter = null;
    if (timer !== null) clearTimeout(timer);
    clearInterval(poseTimer);
    document.removeEventListener("visibilitychange", onVisible);
    window.removeEventListener("pagehide", onLeave);
    mesh.close();
    onLeave();
    peers.clear();
    usePresenceStore.getState().setPeerList([]);
    usePresenceStore.getState().setDirect(0);
  };
}
