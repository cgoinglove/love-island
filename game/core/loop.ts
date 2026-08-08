import { FIXED_DT, MAX_FRAME_DELTA } from "@/shared/constants";

/**
 * 고정 타임스텝 + 누산기.
 * (Gaffer on Games, "Fix Your Timestep!" 의 그 패턴)
 *
 * 왜 필요한가: requestAnimationFrame 의 delta 는 프레임마다 다르다. 그대로 물리에 넣으면
 * 같은 조작을 해도 기기마다 다른 곳에 도착한다. 시뮬레이션은 항상 1/60 로 고정해서 돌리고,
 * 렌더만 남은 잔량(alpha)으로 보간한다.
 *
 * three/react 를 import 하지 않는다 — 순수 함수라 vitest 로 검증한다.
 */

export interface StepPlan {
  /** 이번 프레임에 돌려야 할 고정 스텝 횟수. */
  readonly steps: number;
  /** 다음 프레임으로 넘길 누산기 잔량(초). 항상 [0, fixedDt) */
  readonly accumulator: number;
  /** 마지막 스텝과 다음 스텝 사이의 보간 계수 [0, 1). 렌더에만 쓴다. */
  readonly alpha: number;
}

export function planSteps(
  accumulator: number,
  delta: number,
  fixedDt: number = FIXED_DT,
  maxDelta: number = MAX_FRAME_DELTA,
): StepPlan {
  // 탭이 백그라운드에 있다 돌아오면 delta 가 수십 초로 튄다. 클램프가 없으면
  // 그 프레임에서 수천 번 스텝을 돌다 브라우저가 멈춘다 (spiral of death).
  const clamped = Math.min(Math.max(delta, 0), maxDelta);
  const filled = accumulator + clamped;
  const steps = Math.floor(filled / fixedDt);
  const leftover = filled - steps * fixedDt;
  return { steps, accumulator: leftover, alpha: leftover / fixedDt };
}

export interface Stepper {
  /**
   * delta 만큼 시간을 흘리며 step 을 필요한 횟수만큼 호출한다.
   * @returns 렌더 보간 계수 alpha
   */
  advance(delta: number, step: (dt: number) => void): number;
  reset(): void;
}

/**
 * planSteps 를 감싼 가변 상태 홀더. useFrame 안에서 쓴다.
 * 여기 담긴 누산기는 React state 가 아니다 — 60Hz 로 setState 하면 그 순간 게임이 끝난다.
 */
export function createStepper(
  fixedDt: number = FIXED_DT,
  maxDelta: number = MAX_FRAME_DELTA,
): Stepper {
  let accumulator = 0;
  return {
    advance(delta, step) {
      const plan = planSteps(accumulator, delta, fixedDt, maxDelta);
      accumulator = plan.accumulator;
      for (let i = 0; i < plan.steps; i++) step(fixedDt);
      return plan.alpha;
    },
    reset() {
      accumulator = 0;
    },
  };
}
