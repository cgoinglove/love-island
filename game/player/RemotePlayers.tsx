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
import {
  applySitPose,
  applySwimPose,
  isInWater,
  isSitting,
  splashInto,
} from "./poses";
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
  const bodyRef = useRef<Group>(null);
  /** 직전 프레임에 물에 있었나. 남이 빠지는 **순간**에도 물보라가 터져야 한다. */
  const wasSwimming = useRef(false);
  const poseRef = useRef<Pose>({ x: 0, z: 0, yaw: 0, y: 0 });
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
    // 지형 높이 **위에** 실려 온 높이를 더한다. 이게 없으면 남의 점프와 넉백이
    // 통째로 사라져서, 본인 화면에서만 뜨고 남의 화면에서는 미끄러진다.
    group.position.set(pose.x, elevationAt(pose.x, pose.z) + pose.y, pose.z);
    group.rotation.y = pose.yaw;

    /**
     * 앉아 있으면 의자에 파묻힌 자세로 그린다.
     * 좌표만 오고 자세는 안 오지만, "지금 앉아 있다" 는 사실은 활동 상태로
     * 따로 오기 때문에(game/net/activity) 이 한 줄이면 남의 앉음도 보인다.
     */
    const body = bodyRef.current;
    const swimming = isInWater(pose.x, pose.z);
    if (body) {
      if (isSitting(playerId)) applySitPose(body);
      else if (swimming) applySwimPose(body, performance.now() / 1000);
      else {
        body.position.y = 0;
        body.rotation.x = 0;
        body.rotation.z = 0;
      }
    }

    /**
     * 남이 물에 빠지는 순간에도 첨벙 터진다.
     *
     * 사건으로 보내지 않는다 — 좌표만 있으면 각자 판정할 수 있고, 밀친 쪽과
     * 밀린 쪽 화면이 어긋날 여지도 없다. 보간 지연만큼 조금 늦게 터지는데,
     * 그건 어차피 그 사람의 몸도 같은 지연으로 움직이므로 같이 늦는다.
     */
    if (swimming !== wasSwimming.current) {
      wasSwimming.current = swimming;
      if (swimming) splashInto(pose.x, pose.z);
    }
  });

  return (
    <group ref={groupRef} visible={false}>
      <ContactShadow />
      {/* 외형은 playerId 로 정해진다 — 서버가 아무것도 안 보내도 모두가 같은 모습을 본다. */}
      <group ref={bodyRef}>
        <CharacterModel seed={playerId} />
      </group>

      <SpeechBubble
        y={CHARACTER_HEIGHT + 0.28}
        nickname={nickname}
        bubble={bubble}
      />
    </group>
  );
}
