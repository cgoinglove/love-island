"use client";

import { useFrame } from "@react-three/fiber";
import { useRef } from "react";
import { createStepper, type Stepper } from "./loop";

/**
 * loop.ts 의 순수 누산기를 R3F 의 useFrame 에 물리는 어댑터.
 *
 * simulate 는 항상 고정 dt 로, 필요한 횟수만큼 호출된다 (0번일 수도, 3번일 수도 있다).
 * present 는 프레임당 정확히 한 번, 보간 계수 alpha 와 함께 호출된다.
 *
 * priority 를 넘기지 않는다: R3F 는 useFrame 우선순위가 0 이 아닌 구독이 하나라도 생기면
 * 자동 렌더링을 멈추고 직접 gl.render() 를 부르라고 요구한다. M0 에서 그럴 이유가 없다.
 * 대신 프레임 내 순서는 구독 순서 = 트리에서의 마운트 순서를 따른다.
 */
export function useFixedStep(
  simulate: (dt: number) => void,
  present: (alpha: number) => void,
): void {
  const stepperRef = useRef<Stepper | null>(null);
  if (stepperRef.current === null) {
    stepperRef.current = createStepper();
  }
  const stepper = stepperRef.current;

  // useFrame 에 매 렌더 새 클로저를 넘겨도 된다 — R3F 가 내부적으로 최신 콜백을 참조한다.
  useFrame((_, delta) => {
    present(stepper.advance(delta, simulate));
  });
}
