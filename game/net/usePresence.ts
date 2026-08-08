"use client";

import { useEffect } from "react";
import type { PlayerController } from "@/game/core/playerControl";
import { startPresence } from "./presence";

/**
 * 위치 교환 루프의 라이프사이클을 React 에 묶는다.
 *
 * 로직은 전부 presence.ts 안에 있고 여기는 시작/정리만 한다 —
 * 그래야 네트워크 코드가 컴포넌트 트리와 무관하게 유지된다.
 */
export function usePresence(
  controllerRef: React.RefObject<PlayerController | null>,
): void {
  useEffect(() => {
    return startPresence(() => {
      const pose = controllerRef.current?.pose();
      // 아직 캐릭터가 준비되지 않았으면 이번 차례는 건너뛴다.
      if (!pose) return null;
      return { x: pose.x, z: pose.z, yaw: pose.yaw };
    });
  }, [controllerRef]);
}
