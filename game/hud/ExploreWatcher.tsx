"use client";

import { useFrame } from "@react-three/fiber";
import { useRef } from "react";
import type { Group } from "three";
import { SPAWN_POINT } from "@/game/core/island";
import { awardStamp, hasStamp } from "./stamps";

/**
 * "섬 한 바퀴" 도장을 지켜본다.
 *
 * ── 왜 거리인가 ──
 * 특정 지점을 밟게 하면 그 지점이 목적지가 되고, 사람들은 지도만 보고 직선으로 간다.
 * **스폰에서 충분히 멀어졌는가**로 재면 어느 방향으로 가든 인정되고,
 * 그 과정에서 섬을 실제로 보게 된다.
 */
const AWAY_DISTANCE = 34;

export function ExploreWatcher({
  playerRef,
}: {
  playerRef: React.RefObject<Group | null>;
}) {
  const done = useRef(false);

  useFrame(() => {
    if (done.current) return;
    // 이미 찍혔으면 매 프레임 거리를 잴 이유가 없다.
    if (hasStamp("explored")) {
      done.current = true;
      return;
    }

    const player = playerRef.current;
    if (!player) return;

    const distance = Math.hypot(
      player.position.x - SPAWN_POINT[0],
      player.position.z - SPAWN_POINT[1],
    );
    if (distance > AWAY_DISTANCE) {
      done.current = true;
      awardStamp("explored");
    }
  });

  return null;
}
