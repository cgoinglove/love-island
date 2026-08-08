"use client";

import { useFrame } from "@react-three/fiber";
import { findNearest } from "@/game/core/interactable";
import { usePlayerController } from "@/game/core/playerControl";
import { useHudStore } from "./store";

/**
 * Canvas 안에 놓는 논-렌더 컴포넌트.
 * 매 프레임 근접 판정을 하되, **바뀌었을 때만** 스토어를 건드린다.
 *
 * 이 한 줄의 조건문이 "초당 60번 리렌더"와 "가끔 한 번 리렌더"를 가른다.
 */
export function InteractionWatcher() {
  const controllerRef = usePlayerController();

  useFrame(() => {
    const pose = controllerRef.current?.pose();
    if (!pose) return;

    const nearest = findNearest(pose.x, pose.z);
    const nextId = nearest?.id ?? null;
    const state = useHudStore.getState();
    if (nextId !== state.nearbyId) {
      state.setNearby(nextId, nearest?.label ?? null);
    }
  });

  return null;
}
