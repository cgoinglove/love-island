import { describe, expect, it } from "vitest";
import { buildNavGrid, canStandAt, type NavGrid } from "@/game/core/nav/grid";
import { FIXED_DT } from "@/shared/constants";
import { SHOVE_IMPULSE, SHOVE_LIFT } from "@/shared/presence";
import type { GridSpec, Vec2XZ } from "@/shared/types";
import {
  applyImpulse,
  createPlayerState,
  DEFAULT_MOVE,
  IDLE_INTENT,
  interpolatePose,
  type MoveIntent,
  type PlayerState,
  type RenderPose,
  stepPlayer,
} from "./simulation";

const walk = (axis: Vec2XZ, sprint = false): MoveIntent => ({
  axis,
  jump: false,
  sprint,
});
const EAST = walk([1, 0]);
const NORTH = walk([0, -1]);
const NORTHEAST = walk([1, -1]);
const JUMP: MoveIntent = { axis: [0, 0], jump: true, sprint: false };

/** 20m x 20m 짜리 빈 방. |x| < 5, |z| < 5 안쪽만 걸을 수 있다. */
const ROOM_SPEC: GridSpec = {
  cols: 80,
  rows: 80,
  cellSize: 0.25,
  originX: -10,
  originZ: -10,
};
/** 프로덕션과 같은 의미론으로 굽는다 — 마스크가 몸 두께를 이미 안다. */
const ROOM: NavGrid = buildNavGrid(
  ROOM_SPEC,
  (x, z) => Math.abs(x) < 5 && Math.abs(z) < 5,
  DEFAULT_MOVE.radius,
);

/** 벽에 닿지 않고 최고 속도까지 가속할 수 있는 넓은 벌판. */
const FIELD_SPEC: GridSpec = {
  cols: 200,
  rows: 200,
  cellSize: 0.5,
  originX: -50,
  originZ: -50,
};
const FIELD: NavGrid = buildNavGrid(
  FIELD_SPEC,
  () => true,
  DEFAULT_MOVE.radius,
);

/** 같은 방 한가운데에 기둥이 하나 서 있다. */
const PILLAR: NavGrid = buildNavGrid(
  ROOM_SPEC,
  (x, z) => Math.abs(x) < 5 && Math.abs(z) < 5 && Math.hypot(x - 2, z) > 1,
  DEFAULT_MOVE.radius,
);

function run(
  state: PlayerState,
  intent: MoveIntent,
  steps: number,
  grid: NavGrid = ROOM,
): void {
  for (let i = 0; i < steps; i++) {
    stepPlayer(state, intent, FIXED_DT, DEFAULT_MOVE, grid);
  }
}

const speedOf = (s: PlayerState) => Math.hypot(s.vx, s.vz);

describe("걷기", () => {
  it("입력이 없으면 제자리에 있는다", () => {
    const state = createPlayerState(1, 2);
    run(state, IDLE_INTENT, 60);
    expect(state.x).toBe(1);
    expect(state.z).toBe(2);
    expect(speedOf(state)).toBe(0);
  });

  it("동쪽 입력은 +X 로, 북쪽 입력은 -Z 로 보낸다", () => {
    const east = createPlayerState();
    run(east, EAST, 30);
    expect(east.x).toBeGreaterThan(0);

    const north = createPlayerState();
    run(north, NORTH, 30);
    expect(north.z).toBeLessThan(0);
  });

  it("대각선 이동이 직선보다 빠르지 않다", () => {
    // 최고 속도를 재는 검사는 전부 벌판에서 한다 — 좁은 방에서는 속도가 오르기 전에
    // 벽에 닿아 0 이 되고, 그러면 "정규화가 됐는가"가 아니라 "방이 큰가"를 재게 된다.
    const diagonal = createPlayerState();
    run(diagonal, NORTHEAST, 60, FIELD);
    expect(speedOf(diagonal)).toBeCloseTo(DEFAULT_MOVE.maxSpeed, 6);

    const straight = createPlayerState();
    run(straight, EAST, 60, FIELD);
    expect(speedOf(straight)).toBeCloseTo(DEFAULT_MOVE.maxSpeed, 6);
  });

  it("달리면 걷기보다 빠르다", () => {
    // 좁은 방에서 돌리면 최고 속도에 닿기 전에 벽에 부딪힌다. 벌판에서 잰다.
    const walking = createPlayerState();
    run(walking, EAST, 90, FIELD);

    const sprinting = createPlayerState();
    run(sprinting, walk([1, 0], true), 90, FIELD);

    expect(speedOf(sprinting)).toBeCloseTo(
      DEFAULT_MOVE.maxSpeed * DEFAULT_MOVE.sprintMultiplier,
      5,
    );
    expect(speedOf(sprinting)).toBeGreaterThan(speedOf(walking) * 1.5);
  });

  it("입력을 떼면 마찰로 완전히 멈춘다", () => {
    const state = createPlayerState();
    run(state, EAST, 60, FIELD);
    expect(speedOf(state)).toBeGreaterThan(0);
    run(state, IDLE_INTENT, 60, FIELD);
    expect(speedOf(state)).toBe(0);
  });
});

describe("점프", () => {
  it("땅에서 점프하면 떠올랐다 정확히 지면으로 돌아온다", () => {
    const state = createPlayerState();
    stepPlayer(state, JUMP, FIXED_DT, DEFAULT_MOVE, ROOM);
    expect(state.grounded).toBe(false);
    expect(state.y).toBeGreaterThan(0);

    // 충분히 오래 돌리면 반드시 착지한다.
    run(state, IDLE_INTENT, 180);
    expect(state.grounded).toBe(true);
    expect(state.y).toBe(0);
    expect(state.vy).toBe(0);
  });

  it("최고 높이가 물리 공식과 맞는다", () => {
    const state = createPlayerState();
    let peak = 0;
    stepPlayer(state, JUMP, FIXED_DT, DEFAULT_MOVE, ROOM);
    for (let i = 0; i < 180; i++) {
      stepPlayer(state, IDLE_INTENT, FIXED_DT, DEFAULT_MOVE, ROOM);
      peak = Math.max(peak, state.y);
    }
    // h = v² / 2g. 고정 스텝 적분이라 오차가 조금 있다.
    const expected = DEFAULT_MOVE.jumpSpeed ** 2 / (2 * DEFAULT_MOVE.gravity);
    expect(peak).toBeGreaterThan(expected * 0.9);
    expect(peak).toBeLessThan(expected * 1.15);
  });

  it("공중에서는 다시 점프할 수 없다 (이단 점프 금지)", () => {
    const state = createPlayerState();
    stepPlayer(state, JUMP, FIXED_DT, DEFAULT_MOVE, ROOM);
    const vyAfterFirst = state.vy;
    // 공중에서 점프 버튼을 계속 눌러도 vy 가 다시 차오르면 안 된다.
    for (let i = 0; i < 10; i++) {
      stepPlayer(state, JUMP, FIXED_DT, DEFAULT_MOVE, ROOM);
      expect(state.vy).toBeLessThan(vyAfterFirst);
    }
  });

  it("점프 중에도 앞으로 나아간다", () => {
    // 벽에 붙어 있으면 점프해도 앞으로 못 가는 게 맞다. 벌판에서 재야 점프의 성질을 잰다.
    const state = createPlayerState();
    run(state, EAST, 40, FIELD);
    const before = state.x;
    stepPlayer(
      state,
      { axis: [1, 0], jump: true, sprint: false },
      FIXED_DT,
      DEFAULT_MOVE,
      FIELD,
    );
    run(state, walk([1, 0]), 30, FIELD);
    expect(state.x).toBeGreaterThan(before);
  });

  it("점프해도 벽을 넘어가지 못한다 (수평 충돌은 그대로)", () => {
    const state = createPlayerState();
    run(state, { axis: [1, 0], jump: true, sprint: true }, 600);
    expect(state.x).toBeLessThan(5);
    expect(canStandAt(ROOM, state.x, state.z)).toBe(true);
  });
});

describe("밀치기(넉백)", () => {
  it("속도를 밀어 넣으면 그 방향으로 날아간다", () => {
    const state = createPlayerState(0, 0);
    const push = 6;
    const lift = 3;
    applyImpulse(state, push, 0, lift);
    expect(state.grounded).toBe(false);

    /**
     * 체공 시간은 2·v/g 다. 옛날엔 "1/3초"라고 적어뒀는데 중력을 바꾸자마자
     * 검사 시점이 착지 이후로 밀려나 엉뚱하게 실패했다. 설정에서 유도한다.
     */
    const airborneSteps = (2 * lift) / DEFAULT_MOVE.gravity / FIXED_DT;
    const steps = Math.max(1, Math.floor(airborneSteps / 2));
    run(state, IDLE_INTENT, steps, FIELD);

    // 마찰이 있어도 초반엔 무저항 이동의 절반은 가야 "날아갔다"로 보인다.
    // 고정값(0.5m)을 적어두면 중력이나 마찰을 바꿀 때마다 뜻 없이 깨진다.
    expect(state.x).toBeGreaterThan(push * steps * FIXED_DT * 0.5);
    expect(state.y).toBeGreaterThan(0);
    expect(state.grounded).toBe(false);
  });

  it("넉백으로도 벽을 뚫지 못한다", () => {
    const state = createPlayerState(4, 0);
    // 벽(x=5) 쪽으로 아주 세게 민다.
    applyImpulse(state, 60, 0, 0);
    run(state, IDLE_INTENT, 120);

    // 벽 안쪽에 있고, 설 수 있는 칸 위에 있어야 한다.
    // 통행 마스크는 0.25m 격자라 이상적인 경계보다 반 칸까지 넘어설 수 있다 —
    // 그 여유를 인정하되 벽(5)은 절대 못 넘는다.
    expect(state.x).toBeLessThan(5 - DEFAULT_MOVE.radius + ROOM_SPEC.cellSize);
    expect(canStandAt(ROOM, state.x, state.z)).toBe(true);
  });

  it("넉백은 즉시 잘리지 않는다 (최고 속도 상한에 먹히면 안 된다)", () => {
    const state = createPlayerState();
    // 실제로 쓰는 세기로 검사한다. 상수를 손으로 베끼면 이동 속도만 올렸을 때
    // 밀치기가 걷기보다 느려진 걸 아무도 눈치채지 못한다.
    applyImpulse(state, SHOVE_IMPULSE, 0, SHOVE_LIFT);
    stepPlayer(state, IDLE_INTENT, FIXED_DT, DEFAULT_MOVE, ROOM);
    expect(state.vx).toBeGreaterThan(DEFAULT_MOVE.maxSpeed * 1.5);
  });

  it("결국 마찰로 멈춘다", () => {
    const state = createPlayerState();
    applyImpulse(state, 9, 0, 3);
    run(state, IDLE_INTENT, 300, FIELD);
    expect(speedOf(state)).toBe(0);
  });
});

describe("충돌", () => {
  it("걸을 수 없는 곳으로 나가지 못한다", () => {
    const state = createPlayerState();
    run(state, EAST, 600);
    // 마스크가 두께를 알고 있으므로 중심은 벽에서 몸 반지름만큼 떨어진 채 멈춘다.
    expect(state.x).toBeLessThan(5 - DEFAULT_MOVE.radius + ROOM_SPEC.cellSize);
    expect(state.x).toBeGreaterThan(3.8);
    expect(state.vx).toBe(0);
    expect(canStandAt(ROOM, state.x, state.z)).toBe(true);
  });

  it("벽에 붙어도 벽과 나란한 축으로는 계속 미끄러진다", () => {
    const state = createPlayerState();
    run(state, EAST, 600);
    const zBefore = state.z;
    run(state, NORTHEAST, 60);
    expect(state.z).toBeLessThan(zBefore - 0.5);
  });

  it("어떤 순간에도 걸을 수 없는 칸 위에 있지 않다", () => {
    const state = createPlayerState(0, 0);
    const inputs = [
      EAST,
      NORTHEAST,
      NORTH,
      walk([-1, 1]),
      walk([-1, -1]),
      walk([1, 1]),
    ];
    for (let i = 0; i < 900; i++) {
      stepPlayer(
        state,
        inputs[i % inputs.length] as MoveIntent,
        FIXED_DT,
        DEFAULT_MOVE,
        PILLAR,
      );
      expect(Math.abs(state.x)).toBeLessThan(5);
      expect(Math.abs(state.z)).toBeLessThan(5);
      expect(Math.hypot(state.x - 2, state.z)).toBeGreaterThan(0.6);
    }
  });
});

describe("회전", () => {
  it("진행 방향을 바라본다", () => {
    const state = createPlayerState();
    run(state, EAST, 60);
    // 동쪽을 보는 yaw = atan2(-1, 0) = -π/2
    expect(state.yaw).toBeCloseTo(-Math.PI / 2, 3);
  });

  it("멈춰 있을 때는 회전하지 않는다 (잔속도로 부들거리는 것 방지)", () => {
    const state = createPlayerState();
    state.yaw = 1.234;
    run(state, IDLE_INTENT, 60);
    expect(state.yaw).toBe(1.234);
  });
});

describe("interpolatePose", () => {
  const out: RenderPose = { x: 0, z: 0, y: 0, yaw: 0 };

  it("alpha 0 은 이전 상태, 1 은 다음 상태", () => {
    const prev = createPlayerState(0, 0, 0);
    const next = createPlayerState(10, -4, 1);
    next.y = 2;

    interpolatePose(prev, next, 0, out);
    expect(out).toEqual({ x: 0, z: 0, y: 0, yaw: 0 });

    interpolatePose(prev, next, 1, out);
    expect(out.x).toBeCloseTo(10, 10);
    expect(out.y).toBeCloseTo(2, 10);
  });

  it("점프 높이도 보간한다", () => {
    const prev = createPlayerState();
    const next = createPlayerState();
    next.y = 2;
    interpolatePose(prev, next, 0.5, out);
    expect(out.y).toBeCloseTo(1, 10);
  });

  it("yaw 는 ±π 이음매에서도 짧은 쪽으로 보간한다", () => {
    const a = createPlayerState(0, 0, Math.PI - 0.1);
    const b = createPlayerState(0, 0, -Math.PI + 0.1);
    interpolatePose(a, b, 0.5, out);
    expect(Math.abs(out.yaw)).toBeCloseTo(Math.PI, 6);
  });
});
