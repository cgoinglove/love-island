"use client";

import { useFrame } from "@react-three/fiber";
import { useEffect, useRef } from "react";
import type { Group } from "three";
import { elevationAt } from "@/game/core/island";
import { type Pose, sample } from "@/game/net/interpolation";
import { getPeers, usePresenceStore } from "@/game/net/presence";
import { useRoomEventStore } from "@/game/net/roomEvents";
import {
  PRESENCE_INTERP_DELAY_MS,
  RTC_INTERP_DELAY_MS,
} from "@/shared/presence";
import { CHARACTER_HEIGHT, CharacterModel } from "./CharacterModel";
import { ContactShadow } from "./ContactShadow";
import { SpeechBubble } from "./SpeechBubble";

/**
 * 지금 섬에 있는 다른 사람들.
 *
 * peerList 는 누가 들어오고 나가고 이름이 바뀔 때만 갱신되므로 리렌더가 드물다.
 * 좌표는 React 를 거치지 않고 각 RemotePlayer 가 매 프레임 직접 mutate 한다. (기획서 §4.1)
 */
export function RemotePlayers() {
  const peerList = usePresenceStore((state) => state.peerList);
  const expireBubbles = useRoomEventStore((state) => state.expireBubbles);

  // 말풍선 만료는 초당 두 번이면 충분하다. 매 프레임 돌릴 이유가 없다.
  useEffect(() => {
    const timer = setInterval(expireBubbles, 500);
    return () => clearInterval(timer);
  }, [expireBubbles]);

  return (
    <>
      {peerList.map((peer) => (
        <RemotePlayer
          key={peer.playerId}
          playerId={peer.playerId}
          nickname={peer.nickname}
        />
      ))}
    </>
  );
}

function RemotePlayer({
  playerId,
  nickname,
}: {
  playerId: string;
  nickname: string | null;
}) {
  const groupRef = useRef<Group>(null);
  const poseRef = useRef<Pose>({ x: 0, z: 0, yaw: 0 });
  const bubble = useRoomEventStore((state) => state.bubbles[playerId]);

  useFrame(() => {
    const group = groupRef.current;
    const current = getPeers().get(playerId);
    if (!group || !current) return;

    /**
     * 지금이 아니라 과거를 그린다.
     * 반직관적이지만 이게 모든 멀티플레이어 게임이 하는 일이다 —
     * 항상 두 스냅샷 사이에 있게 되므로 추측 없이 보간만으로 부드러워진다. (기획서 §5.3)
     *
     * P2P 로 20Hz 씩 들어오면 120ms 면 충분하고, 폴링 폴백이면 5Hz 라 320ms 가 필요하다.
     */
    const delay = current.direct
      ? RTC_INTERP_DELAY_MS
      : PRESENCE_INTERP_DELAY_MS;
    if (!sample(current.buffer, performance.now() - delay, poseRef.current)) {
      group.visible = false;
      return;
    }

    const pose = poseRef.current;
    group.visible = true;
    // 리모트는 점프 높이를 따로 받지 않는다 — 좌표만 6바이트로 보내기 때문이다.
    // 지형 높이에 붙여두면 점프가 살짝 뭉개지지만 대역폭을 지킨다.
    group.position.set(pose.x, elevationAt(pose.x, pose.z), pose.z);
    group.rotation.y = pose.yaw;
  });

  return (
    <group ref={groupRef} visible={false}>
      <ContactShadow />
      {/* 외형은 playerId 로 정해진다 — 서버가 아무것도 안 보내도 모두가 같은 모습을 본다. */}
      <CharacterModel seed={playerId} />

      <SpeechBubble
        y={CHARACTER_HEIGHT + 0.28}
        nickname={nickname}
        bubble={bubble}
      />
    </group>
  );
}
