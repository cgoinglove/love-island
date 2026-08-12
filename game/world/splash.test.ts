import { describe, expect, it } from "vitest";
import { splashColor, splashSpecs } from "./splash";

/**
 * 물보라는 폭죽과 **같은 셰이더**가 그린다(reactionPool).
 * 그래서 물처럼 보이게 하는 건 모양이 아니라 초기 조건 몇 개뿐이고,
 * 그 몇 개가 어긋나면 물방울이 연기처럼 떠다닌다.
 */

function fixedRandom(): () => number {
  let seed = 0.37;
  return () => {
    seed = (seed * 9301 + 0.49297) % 1;
    return seed;
  };
}

const options = {
  x: 3,
  y: 0,
  z: -4,
  count: 40,
  speed: 5,
  spread: 0.9,
  color: splashColor(() => 0.1),
};

describe("물보라", () => {
  it("전부 위로 튄다", () => {
    // 아래로 뿌리면 그건 물보라가 아니라 그냥 사라지는 점이다.
    for (const spec of splashSpecs(options, fixedRandom())) {
      expect(spec.vy).toBeGreaterThan(0);
    }
  });

  it("수면 아래로 내려가지 않는다", () => {
    /**
     * floor 가 0 이라 셰이더가 수면에서 붙잡는다. 이게 없으면 물방울이
     * 바다를 뚫고 내려가 사라진다 — 물리적으로는 맞지만 화면에서는
     * 그냥 없어지는 것으로 보인다.
     */
    for (const spec of splashSpecs(options, fixedRandom())) {
      expect(spec.floor).toBe(0);
      expect(spec.oy).toBeGreaterThanOrEqual(0);
    }
  });

  it("무겁고 금방 사라진다", () => {
    for (const spec of splashSpecs(options, fixedRandom())) {
      // 폭죽 별(-3.2)보다 훨씬 무거워야 떨어지는 물처럼 보인다.
      expect(spec.gravity).toBeLessThan(-10);
      // 물보라가 3초씩 남아 있으면 그건 안개다.
      expect(spec.life).toBeLessThan(1.3);
    }
  });

  it("퍼지는 폭이 spread 를 넘지 않는다", () => {
    const narrow = splashSpecs({ ...options, spread: 0.2 }, fixedRandom());
    const wide = splashSpecs({ ...options, spread: 1 }, fixedRandom());
    const sideways = (specs: typeof narrow) =>
      Math.max(...specs.map((s) => Math.hypot(s.vx, s.vz)));
    // 좁게 주문하면 기둥처럼 솟고, 넓게 주문하면 반구로 퍼진다.
    expect(sideways(narrow)).toBeLessThan(sideways(wide));
  });
});
