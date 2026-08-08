"use client";

import { useControls } from "leva";
import { DEFAULT_MOVE, type MoveConfig } from "@/game/player/simulation";

/**
 * leva 튜닝 패널. 개발 중에만 뜬다.
 *
 * "느낌"은 코드를 고쳐서 못 찾는다. 빌드 한 번에 30초 걸리면 FOV 를 30 → 28 로 바꿔볼 생각을
 * 아예 안 하게 된다. 슬라이더로 만들어두면 5분 만에 답이 나온다.
 *
 * 여기 값들은 리렌더를 유발하지만 괜찮다 — 슬라이더를 드래그하는 동안만 도는
 * 저빈도 상태다. 프레임 데이터(위치·속도)는 절대 이 층에 두지 않는다. (기획서 §4.1)
 */

export interface CameraTuning {
  fov: number;
  distance: number;
  pitchDeg: number;
  height: number;
  smoothTime: number;
}

export interface Tuning {
  camera: CameraTuning;
  move: MoveConfig;
  curvature: number;
}

export function useTuning(): Tuning {
  const camera = useControls("카메라", {
    fov: { value: 40, min: 12, max: 75, step: 1, label: "시야각°" },
    distance: { value: 24, min: 4, max: 60, step: 0.5, label: "거리 m" },
    pitchDeg: { value: 23, min: 5, max: 85, step: 1, label: "부감°" },
    height: { value: 1.8, min: 0, max: 3, step: 0.05, label: "주시 높이 m" },
    smoothTime: {
      value: 0.22,
      min: 0.01,
      max: 1,
      step: 0.01,
      label: "추적 지연 s",
    },
  });

  const world = useControls("월드", {
    // 0 이면 평평한 판, 0.004 면 거의 구슬. 0.0012 근처가 "섬이 떠 있는" 느낌.
    curvature: {
      value: 0.0013,
      min: 0,
      max: 0.005,
      step: 0.0001,
      label: "지평선 곡률",
    },
  });

  const move = useControls("이동", {
    maxSpeed: {
      value: DEFAULT_MOVE.maxSpeed,
      min: 0.5,
      max: 10,
      step: 0.1,
      label: "걷기 m/s",
    },
    sprintMultiplier: {
      value: DEFAULT_MOVE.sprintMultiplier,
      min: 1,
      max: 3,
      step: 0.05,
      label: "달리기 배수",
    },
    accel: {
      value: DEFAULT_MOVE.accel,
      min: 2,
      max: 60,
      step: 1,
      label: "가속 m/s²",
    },
    friction: {
      value: DEFAULT_MOVE.friction,
      min: 2,
      max: 80,
      step: 1,
      label: "마찰 m/s²",
    },
    turnLambda: {
      value: DEFAULT_MOVE.turnLambda,
      min: 1,
      max: 40,
      step: 0.5,
      label: "회전 감쇠",
    },
    jumpSpeed: {
      value: DEFAULT_MOVE.jumpSpeed,
      min: 2,
      max: 12,
      step: 0.1,
      label: "점프 m/s",
    },
    gravity: {
      value: DEFAULT_MOVE.gravity,
      min: 6,
      max: 40,
      step: 0.5,
      label: "중력 m/s²",
    },
  });

  return {
    camera,
    curvature: world.curvature,
    move: { ...move, radius: DEFAULT_MOVE.radius },
  };
}
