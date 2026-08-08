import { describe, expect, it } from "vitest";
import { FIXED_DT, MAX_FRAME_DELTA } from "@/shared/constants";
import { createStepper, planSteps } from "./loop";

describe("planSteps", () => {
  it("정확히 한 스텝만큼 흐르면 1스텝, 잔량 0", () => {
    const plan = planSteps(0, FIXED_DT);
    expect(plan.steps).toBe(1);
    expect(plan.accumulator).toBeCloseTo(0, 10);
    expect(plan.alpha).toBeCloseTo(0, 10);
  });

  it("한 스텝에 못 미치면 스텝 없이 누산만 한다", () => {
    const plan = planSteps(0, FIXED_DT / 2);
    expect(plan.steps).toBe(0);
    expect(plan.alpha).toBeCloseTo(0.5, 6);
  });

  it("잔량이 다음 프레임으로 넘어가 결국 한 스텝이 된다", () => {
    const first = planSteps(0, FIXED_DT * 0.6);
    expect(first.steps).toBe(0);
    const second = planSteps(first.accumulator, FIXED_DT * 0.6);
    expect(second.steps).toBe(1);
  });

  it("불규칙한 프레임이 이어져도 총 스텝 수는 경과 시간에 수렴한다", () => {
    // 30fps 와 144fps 를 오가는 최악의 상황을 흉내낸다.
    const deltas = [0.033, 0.007, 0.021, 0.007, 0.016, 0.041, 0.007, 0.012];
    const elapsed = deltas.reduce((a, b) => a + b, 0);

    let accumulator = 0;
    let total = 0;
    for (const delta of deltas) {
      const plan = planSteps(accumulator, delta);
      accumulator = plan.accumulator;
      total += plan.steps;
    }

    // 시뮬레이션이 진행한 시간과 실제 경과 시간의 차이는 항상 한 스텝 미만이어야 한다.
    expect(elapsed - total * FIXED_DT).toBeGreaterThanOrEqual(0);
    expect(elapsed - total * FIXED_DT).toBeLessThan(FIXED_DT);
  });

  it("탭 복귀로 delta 가 폭주해도 클램프된다 (spiral of death 방지)", () => {
    // 백그라운드에 30초 있다 돌아온 상황. 클램프가 없으면 1800 스텝을 한 프레임에 돈다.
    const plan = planSteps(0, 30);
    expect(plan.steps).toBe(Math.floor(MAX_FRAME_DELTA / FIXED_DT));
    expect(plan.steps).toBeLessThanOrEqual(15);
  });

  it("음수 delta 는 시간을 되돌리지 않는다", () => {
    const plan = planSteps(0.01, -5);
    expect(plan.steps).toBe(0);
    expect(plan.accumulator).toBeCloseTo(0.01, 10);
  });

  it("alpha 는 항상 [0, 1)", () => {
    let accumulator = 0;
    for (let i = 0; i < 500; i++) {
      // 결정적인 유사 난수 — Math.random() 을 쓰면 실패를 재현할 수 없다.
      const delta = ((i * 7919) % 97) / 3000;
      const plan = planSteps(accumulator, delta);
      accumulator = plan.accumulator;
      expect(plan.alpha).toBeGreaterThanOrEqual(0);
      expect(plan.alpha).toBeLessThan(1);
    }
  });
});

describe("createStepper", () => {
  it("step 을 정확한 횟수만큼, 항상 고정 dt 로 호출한다", () => {
    const stepper = createStepper();
    const seen: number[] = [];

    stepper.advance(FIXED_DT * 3.5, (dt) => seen.push(dt));

    expect(seen).toHaveLength(3);
    expect(new Set(seen)).toEqual(new Set([FIXED_DT]));
  });

  it("reset 하면 누산기가 비워진다", () => {
    const stepper = createStepper();
    stepper.advance(FIXED_DT * 0.9, () => {});
    stepper.reset();

    let calls = 0;
    stepper.advance(FIXED_DT * 0.9, () => {
      calls++;
    });
    expect(calls).toBe(0);
  });
});
