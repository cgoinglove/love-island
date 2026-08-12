import { describe, expect, it } from "vitest";
import { elevationAt } from "@/game/core/island";
import {
  BALL_RADIUS,
  GOAL_CENTER_X,
  GOAL_HEIGHT,
  GOAL_Z,
  PITCH_CENTER,
} from "./constants";
import {
  type BallState,
  ballAtRest,
  crossedGoal,
  kickBall,
  STEP,
  stepBall,
} from "./physics";

/**
 * 공의 규칙은 셋이다.
 *
 *  1. **멈춘다.** 영원히 굴러다니면 다음 사람이 찰 수 없다.
 *  2. **잃어버릴 수 없다.** 바다로 차 넣는 건 놀다 보면 반드시 벌어지는 일이라,
 *     그때 놀이가 끝나면 안 된다.
 *  3. **같은 입력이면 같은 자리.** 각자 계산하는 물건이라 이게 깨지면
 *     두 사람이 다른 공을 보고 논다.
 */

const FLAT = (_x: number, _z: number) => 0.45;

function home(): BallState {
  return {
    x: PITCH_CENTER[0],
    y: BALL_RADIUS + 0.45,
    z: PITCH_CENTER[1],
    vx: 0,
    vy: 0,
    vz: 0,
  };
}

function run(
  state: BallState,
  seconds: number,
  ground: (x: number, z: number) => number = FLAT,
): BallState {
  let now = state;
  for (let i = 0; i < Math.round(seconds / STEP); i += 1) {
    now = stepBall(now, ground);
  }
  return now;
}

describe("비치볼", () => {
  it("찬 공은 몇 초 안에 멈춘다", () => {
    const kicked = kickBall(home(), { x: PITCH_CENTER[0], z: 4 }, 5);
    expect(ballAtRest(kicked, 0.45)).toBe(false);
    expect(ballAtRest(run(kicked, 12), 0.45)).toBe(true);
  });

  it("땅을 뚫고 내려가지 않는다", () => {
    let state = kickBall(home(), { x: PITCH_CENTER[0] + 1, z: 4 }, 6);
    for (let i = 0; i < 900; i += 1) {
      state = stepBall(state, FLAT);
      expect(state.y).toBeGreaterThanOrEqual(0.45 + BALL_RADIUS - 0.001);
    }
  });

  it("바다에 빠져도 가라앉지 않고 뭍으로 돌아온다", () => {
    /**
     * 실제 지형에 대고 돌린다. 놀이터에서 바다 쪽으로 세게 차 넣은 뒤,
     * 물에 뜬 채로 **섬 쪽으로** 오는지 본다.
     */
    const west: BallState = {
      x: -48,
      y: 0.6,
      z: 1,
      vx: -6,
      vy: 2,
      vz: 0,
    };
    const drifted = run(west, 30, elevationAt);
    expect(drifted.y).toBeGreaterThan(0);
    // 30초 뒤에는 밀려나기를 멈추고 섬 쪽으로 돌아서 있어야 한다.
    expect(drifted.vx).toBeGreaterThan(0);
  });

  it("같은 상태에서 시작하면 언제나 같은 자리에 온다", () => {
    const kicked = kickBall(home(), { x: PITCH_CENTER[0], z: 5 }, 4);
    expect(run(kicked, 3)).toEqual(run(kicked, 3));
  });

  it("세게 찬 공도 골문을 건너뛰지 않는다", () => {
    /**
     * ⚠ "지금 골문 안에 있나" 로만 재면 **세게 찬 골일수록 안 들어간다.**
     *   한 걸음에 골문을 통째로 지나가기 때문이다. 그래서 전후 두 자리를
     *   함께 보고 그 사이를 가로질렀는지로 판정한다.
     */
    const before: BallState = {
      x: GOAL_CENTER_X,
      y: 1,
      z: GOAL_Z + 0.9,
      vx: 0,
      vy: 0,
      vz: -50,
    };
    const after = { ...before, z: GOAL_Z - 0.9 };
    expect(crossedGoal(before, after)).toBe(true);
  });

  it("골대 옆이나 위로 지나간 공은 골이 아니다", () => {
    const base: BallState = {
      x: GOAL_CENTER_X + 5,
      y: 1,
      z: GOAL_Z + 1,
      vx: 0,
      vy: 0,
      vz: -8,
    };
    expect(crossedGoal(base, { ...base, z: GOAL_Z - 1 })).toBe(false);

    const high = { ...base, x: GOAL_CENTER_X, y: GOAL_HEIGHT + 1.5 };
    expect(crossedGoal(high, { ...high, z: GOAL_Z - 1 })).toBe(false);
  });

  it("골대를 지나 되돌아 나온 공은 골이 아니다", () => {
    const out: BallState = {
      x: GOAL_CENTER_X,
      y: 1,
      z: GOAL_Z - 1,
      vx: 0,
      vy: 0,
      vz: 8,
    };
    expect(crossedGoal(out, { ...out, z: GOAL_Z + 1 })).toBe(false);
  });

  it("공은 사람에게서 멀어지는 쪽으로 나간다", () => {
    // 바라보는 방향이 아니라 **부딪힌 자리**가 방향을 정한다.
    const south = kickBall(
      home(),
      { x: PITCH_CENTER[0], z: PITCH_CENTER[1] + 1 },
      3,
    );
    expect(south.vz).toBeLessThan(0);

    const east = kickBall(
      home(),
      { x: PITCH_CENTER[0] + 1, z: PITCH_CENTER[1] },
      3,
    );
    expect(east.vx).toBeLessThan(0);
  });

  it("놀이터는 평평하다", () => {
    /**
     * 공이 굴러가는 물건이라 땅이 기울면 한쪽으로만 간다.
     * 골대까지 포함한 사방이 같은 높이여야 놀이가 성립한다.
     */
    const at = elevationAt(PITCH_CENTER[0], PITCH_CENTER[1]);
    for (let dx = -6; dx <= 6; dx += 1.5) {
      for (let dz = -8; dz <= 6; dz += 1.5) {
        const here = elevationAt(PITCH_CENTER[0] + dx, PITCH_CENTER[1] + dz);
        expect(here).toBeGreaterThan(0.3);
        expect(Math.abs(here - at)).toBeLessThan(0.25);
      }
    }
  });
});
