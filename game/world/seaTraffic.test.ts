import { describe, expect, it } from "vitest";
import { elevationAt } from "@/game/core/island";
import {
  boatsAt,
  finsAt,
  JUMP_SECONDS,
  jumpHeightAt,
  jumpPitchAt,
  jumpsAt,
  LANE_SPAN,
} from "./seaTraffic";

/**
 * 바다 생물의 규칙은 둘뿐이다.
 *
 *  1. **물 위에 있어야 한다.** 섬이 하트라 반지름이 각도마다 두 배 차이 나서,
 *     직선 항로든 원형 순찰이든 눈으로 대충 잡으면 반드시 어딘가에서 육지를 지난다.
 *  2. **시각만 같으면 결과가 같아야 한다.** 옆 사람과 같이 보는 게 전부인 연출이라
 *     한쪽 화면에만 배가 있으면 그건 없는 것보다 나쁘다.
 */

/** 이보다 얕으면 배가 바닥에 닿는다. 물가는 완만해서 -0.5m 면 이미 무릎이다. */
const FLOATABLE = -0.5;

describe("지나가는 배", () => {
  it("항로 어디에서도 육지 위로 올라가지 않는다", () => {
    const aground: string[] = [];
    // 한 바퀴가 가장 긴 항로도 96초면 다 돈다. 200초를 촘촘히 훑는다.
    for (let t = 0; t < 200; t += 0.25) {
      for (const boat of boatsAt(t)) {
        /**
         * 뱃전까지 본다. 중심만 재면 하트의 봉우리(x=±20 에서 z=-30 까지 밀고
         * 나온다)를 배 옆구리가 스치는 걸 놓친다.
         */
        for (const side of [-2.5, 0, 2.5]) {
          const depth = elevationAt(boat.x + side, boat.z);
          if (depth > FLOATABLE) {
            aground.push(
              `t=${t} 항로${boat.lane} (${boat.x.toFixed(1)}, ${boat.z})`,
            );
          }
        }
      }
    }
    expect(aground.slice(0, 3), "\n배가 육지 위를 지나갑니다.\n").toEqual([]);
  });

  it("같은 시각이면 어디서 계산해도 같은 자리다", () => {
    // 두 사람의 화면에서 배가 다른 자리에 있으면 "저 배 봐" 가 성립하지 않는다.
    expect(boatsAt(1234.5)).toEqual(boatsAt(1234.5));
  });

  it("끊기지 않고 이어서 지나간다", () => {
    /**
     * 항로 끝에서 반대편으로 되돌아가는 순간이 있다. 그 한 프레임에 배가
     * 화면을 가로질러 순간이동하는데, 그게 **보이는 자리**에서 일어나면 안 된다.
     */
    for (let t = 0; t < 200; t += 0.05) {
      const before = boatsAt(t);
      const after = boatsAt(t + 0.05);
      for (const [index, boat] of after.entries()) {
        const previous = before[index];
        if (!previous) continue;
        const step = Math.abs(boat.x - previous.x);
        /**
         * 되돌아가는 순간은 항로 끝, 즉 한참 화면 밖이다. 의자에서 보이는
         * 좌우 폭이 가장 넓은 항로도 24m 라, 그 세 배 밖이면 안 보인다.
         */
        if (step > 1) expect(Math.abs(boat.x)).toBeGreaterThan(LANE_SPAN - 1);
      }
    }
  });
});

describe("지느러미", () => {
  it("늘 물 위를 돈다", () => {
    for (let t = 0; t < 400; t += 1) {
      for (const fin of finsAt(t)) {
        expect(elevationAt(fin.x, fin.z)).toBeLessThan(FLOATABLE);
      }
    }
  });

  it("가는 방향을 보고 헤엄친다", () => {
    // yaw 가 진행 방향과 어긋나면 지느러미가 옆으로 미끄러지는 것처럼 보인다.
    for (const t of [0, 37, 88, 143]) {
      const now = finsAt(t);
      const next = finsAt(t + 0.5);
      for (const [index, fin] of now.entries()) {
        const ahead = next[index];
        if (!ahead) continue;
        const moved = Math.atan2(-(ahead.x - fin.x), -(ahead.z - fin.z));
        const gap = Math.abs(
          Math.atan2(Math.sin(moved - fin.yaw), Math.cos(moved - fin.yaw)),
        );
        expect(gap).toBeLessThan(0.2);
      }
    }
  });
});

describe("튀어오르는 물고기", () => {
  it("물에서만 튀어오른다", () => {
    for (let t = 0; t < 300; t += 0.2) {
      for (const jump of jumpsAt(t)) {
        expect(elevationAt(jump.x, jump.z)).toBeLessThan(FLOATABLE);
      }
    }
  });

  it("한 번의 도약이 끊기지 않고 이어진다", () => {
    /**
     * 슬롯 경계에 걸쳐 시작한 도약이 다음 슬롯에서 사라지면, 물고기가 공중에서
     * 증발한다. 그래서 jumpsAt 은 직전 슬롯도 같이 본다.
     */
    let seen = 0;
    for (let t = 0; t < 120; t += 0.05) {
      const jumps = jumpsAt(t);
      if (jumps.length === 0) continue;
      seen += 1;
      for (const jump of jumps) {
        expect(jump.progress).toBeGreaterThanOrEqual(0);
        expect(jump.progress).toBeLessThanOrEqual(1);
      }
    }
    // 4.5초마다 1.05초씩이므로 대략 23% 의 시간 동안 물고기가 나와 있다.
    expect(seen / (120 / 0.05)).toBeGreaterThan(0.15);
  });

  it("물 밖으로 나왔다 다시 잠긴다", () => {
    expect(jumpHeightAt(0)).toBeCloseTo(0);
    expect(jumpHeightAt(1)).toBeCloseTo(0);
    expect(jumpHeightAt(0.5)).toBeGreaterThan(1);
    // 나올 땐 위를, 들어갈 땐 아래를 본다.
    expect(jumpPitchAt(0)).toBeGreaterThan(0);
    expect(jumpPitchAt(1)).toBeLessThan(0);
  });

  it("도약 시간이 슬롯을 넘지 않는다", () => {
    // 넘으면 두 도약이 겹쳐서 같은 물고기가 둘로 보인다.
    expect(JUMP_SECONDS).toBeLessThan(4.5);
  });
});
