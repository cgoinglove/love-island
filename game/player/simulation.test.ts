import { describe, expect, it } from "vitest";
import { buildNavGrid, canStandAt, type NavGrid } from "@/game/core/nav/grid";
import { FIXED_DT } from "@/shared/constants";
import { SHOVE_IMPULSE, SHOVE_LIFT } from "@/shared/presence";
import type { GridSpec, Vec2XZ } from "@/shared/types";
import {
  applyImpulse,
  createPlayerState,
  DEFAULT_MOVE,
  DRY_WORLD,
  IDLE_INTENT,
  interpolatePose,
  type MoveIntent,
  type PlayerState,
  type RenderPose,
  stepPlayer,
  type WaterModel,
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

  it("멀리 날아간다", () => {
    /**
     * "왜 이렇게 어렵냐" 는 말을 듣고 세기를 올렸다. 숫자를 다시 만질 때
     * **얼마나 가야 밀친 것 같은지**를 잊지 않으려고 거리로 못박아 둔다.
     *
     * 상수를 손으로 베끼지 않고 실제로 쓰는 값으로 시뮬레이션한다 —
     * 마찰이나 중력을 바꿨을 때도 여기가 같이 반응해야 의미가 있다.
     */
    const state = createPlayerState(0, 0);
    applyImpulse(state, SHOVE_IMPULSE, 0, SHOVE_LIFT);
    // 멈출 때까지. 안 멈추면 무한루프가 나므로 넉넉한 상한을 둔다.
    for (let i = 0; i < 600; i++) {
      stepPlayer(state, IDLE_INTENT, FIXED_DT, DEFAULT_MOVE, FIELD);
      if (state.grounded && Math.hypot(state.vx, state.vz) < 0.05) break;
    }
    // 섬 반지름이 26~40m 다. 열 걸음쯤은 밀려나야 "날아갔다" 로 보인다.
    expect(state.x).toBeGreaterThan(12);
    // 그렇다고 섬 밖까지 보내면 그건 밀치기가 아니라 추방이다.
    expect(state.x).toBeLessThan(30);
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

describe("축의 길이가 세기다", () => {
  /**
   * ⚠ 예전엔 방향만 쓰고 길이를 버렸다. 키보드는 켜짐/꺼짐이라 티가 안 났는데,
   *   조이스틱에서는 **손가락을 얼마나 밀든 늘 최고 속도**였다 —
   *   폰에서 이동이 너무 빠르게 느껴진 이유의 절반이 이것이다.
   */
  const speedAfter = (axis: [number, number], sprint = false) => {
    const state = createPlayerState(0, 0);
    /**
     * 가속이 끝날 만큼(60m/s² 로 30m/s 까지 0.5초) 돌리되 **제자리에 묶어둔다.**
     * 안 그러면 2초 만에 시험용 격자를 벗어나 벽에 부딪히고, 속도가 0 이 되어
     * 정작 재려던 값이 사라진다.
     */
    for (let i = 0; i < 60; i++) {
      stepPlayer(
        state,
        { axis, jump: false, sprint },
        FIXED_DT,
        DEFAULT_MOVE,
        FIELD,
      );
      state.x = 0;
      state.z = 0;
    }
    return Math.hypot(state.vx, state.vz);
  };

  it("살짝 밀면 살살 걷는다", () => {
    const half = speedAfter([0, -0.5]);
    expect(half).toBeGreaterThan(DEFAULT_MOVE.maxSpeed * 0.4);
    expect(half).toBeLessThan(DEFAULT_MOVE.maxSpeed * 0.6);
  });

  it("끝까지 밀면 최고 속도다", () => {
    expect(speedAfter([0, -1])).toBeCloseTo(DEFAULT_MOVE.maxSpeed, 0);
  });

  it("키보드 대각선이 더 빠르지 않다", () => {
    // (1,1) 은 길이가 1.41 이다. 안 자르면 대각선으로 갈 때만 40% 빨라진다.
    expect(speedAfter([1, -1])).toBeCloseTo(DEFAULT_MOVE.maxSpeed, 0);
  });

  it("달리기는 세기 위에 곱해진다", () => {
    // 반쯤 밀고 달리면 최고 속도의 절반 × 배수. 세기를 무시하면 안 된다.
    const half = speedAfter([0, -0.5], true);
    const full = speedAfter([0, -1], true);
    expect(full).toBeCloseTo(
      DEFAULT_MOVE.maxSpeed * DEFAULT_MOVE.sprintMultiplier,
      0,
    );
    expect(half).toBeLessThan(full * 0.6);
  });
});

describe("물", () => {
  /** 섬 대신 쓰는 아주 단순한 물: x > 4 부터 바다이고, x < 8 까지만 헤엄쳐 나갈 수 있다. */
  const SEA: WaterModel = {
    groundHeight: (x) => (x > 4 ? -1.5 : 1),
    // 물가(x=4)에서 얼마나 나갔나. 안쪽은 0 이라 물가에 조금 겹친다.
    offshore: (x) => Math.max(0, x - 3.2),
  };
  /**
   * 물 위는 **걸을 수 없는** 그리드. 실제 섬과 같은 구성이다 —
   * 네비 그리드가 이미 물을 막고 있고, WaterModel 은 "그럼에도 떠서 갈 수 있는 곳"
   * 을 따로 알려준다. 둘을 어긋나게 두면(그리드는 다 걸을 수 있다고 하고 물만 따로)
   * 헤엄 제한이 통째로 무의미해진다.
   */
  const SHORE: NavGrid = buildNavGrid(
    FIELD_SPEC,
    (x) => x < 4,
    DEFAULT_MOVE.radius,
  );

  function swim(state: PlayerState, intent: MoveIntent, steps: number): void {
    for (let i = 0; i < steps; i += 1) {
      stepPlayer(state, intent, FIXED_DT, DEFAULT_MOVE, SHORE, SEA);
    }
  }

  it("밀쳐지면 물 위로 날아간다", () => {
    /**
     * 예전엔 아무리 세게 밀쳐도 물가에서 딱 멈췄다 — 수평 이동이 언제나
     * "걸을 수 있는 칸인가" 만 봤기 때문이다. 밀치기가 아무 결과도 못 낳던 이유.
     */
    const state = createPlayerState(3, 0);
    applyImpulse(state, 30, 0, 7);
    swim(state, IDLE_INTENT, 120);
    expect(state.x).toBeGreaterThan(4);
    expect(state.swimming).toBe(true);
  });

  it("물에 떠 있는 동안 수면까지 떠오른다", () => {
    // 바닥에 그대로 두면 물에 빠진 사람이 해저에 서 있게 된다.
    const state = createPlayerState(3, 0);
    applyImpulse(state, 30, 0, 7);
    swim(state, IDLE_INTENT, 120);
    // 지형이 -1.5 이므로 1.5 만큼 떠올라야 월드 높이가 해수면(0)이 된다.
    expect(state.y).toBeCloseTo(1.5, 5);
  });

  it("헤엄치면 걷는 것보다 느리다", () => {
    // 둘 다 물가와 나란히(북쪽으로) 간다. 한쪽만 물로 걸어 들어가면 비교가 안 된다.
    const walking = createPlayerState(0, 0);
    swim(walking, walk([0, 1]), 60);

    const paddling = createPlayerState(6, 0);
    swim(paddling, walk([0, 1]), 60);

    expect(paddling.swimming).toBe(true);
    expect(Math.abs(paddling.vz)).toBeLessThan(Math.abs(walking.vz) * 0.5);
  });

  it("먼바다로는 못 나간다", () => {
    /**
     * ⚠ 게임 규칙이 아니라 **통신 계약**이다. presenceBeat 의 좌표는 ±45 까지만
     *   받으므로, 끝없이 헤엄쳐 나가면 위치 전송이 통째로 튕긴다.
     */
    const state = createPlayerState(6, 0);
    swim(state, walk([1, 0], true), 400);
    expect(state.x).toBeLessThan(8);
  });

  it("물에서는 못 뛴다", () => {
    const state = createPlayerState(6, 0);
    swim(state, IDLE_INTENT, 30);
    expect(state.swimming).toBe(true);
    swim(state, JUMP, 1);
    expect(state.vy).toBe(0);
  });

  it("물가의 문턱에 걸리지 않는다", () => {
    /**
     * ⚠ 물이 끝나는 자리(지형 0.1m)와 걸을 수 있는 자리(거기서 몸 두께만큼
     *   더 안쪽)는 다르다. 그 사이 35cm 에 들어서면 헤엄은 끝났는데 걸을 곳은
     *   없어서 **한 발짝도 못 움직인다** — 헤엄쳐 올라올 때마다 턱 걸렸다.
     *
     * 여기서는 그 틈을 SEA 로 흉내낸다: 물은 x>4 에서 끝나지만 걸을 수 있는
     * 칸은 x<3.6 부터다.
     */
    const NARROW: NavGrid = buildNavGrid(
      FIELD_SPEC,
      (x) => x < 3.6,
      DEFAULT_MOVE.radius,
    );
    const state = createPlayerState(3.8, 0);
    const before = state.x;
    for (let i = 0; i < 60; i += 1) {
      stepPlayer(state, walk([-1, 0]), FIXED_DT, DEFAULT_MOVE, NARROW, SEA);
    }
    expect(state.x).toBeLessThan(before - 0.5);
  });

  it("헤엄쳐 물가로 돌아오면 다시 걷는다", () => {
    const state = createPlayerState(6, 0);
    swim(state, walk([-1, 0]), 200);
    expect(state.x).toBeLessThan(4);
    expect(state.swimming).toBe(false);
    expect(state.y).toBe(0);
  });
});

describe("먼바다에 떨어졌을 때", () => {
  /** 물가가 x=4 이고, 그 밖은 어디까지나 바다인 세계. */
  const OPEN_SEA: WaterModel = {
    groundHeight: (x) => (x > 4 ? -2 : 1),
    offshore: (x) => Math.max(0, x - 4),
  };
  const SHORE: NavGrid = buildNavGrid(
    FIELD_SPEC,
    (x) => x < 4,
    DEFAULT_MOVE.radius,
  );

  it("헤엄쳐 뭍으로 돌아올 수 있다", () => {
    /**
     * ⚠ 예전엔 "물가에서 4m 안쪽만 헤엄칠 수 있다" 로만 판정했다. 그러면 어쩌다
     *   더 멀리 떨어진 사람이 — 열기구에서 뛰어내리거나 세게 밀쳐져서 —
     *   **사방이 막힌 채 물 위에 굳는다.** 나가는 것만 막아야 바다가 감옥이
     *   아니라 조류가 된다.
     */
    const state = createPlayerState(20, 0);
    for (let i = 0; i < 900; i += 1) {
      stepPlayer(state, walk([-1, 0]), FIXED_DT, DEFAULT_MOVE, SHORE, OPEN_SEA);
    }
    expect(state.x).toBeLessThan(4);
    expect(state.swimming).toBe(false);
  });

  it("바깥으로는 여전히 못 나간다", () => {
    const state = createPlayerState(5, 0);
    for (let i = 0; i < 900; i += 1) {
      stepPlayer(state, walk([1, 0]), FIXED_DT, DEFAULT_MOVE, SHORE, OPEN_SEA);
    }
    expect(state.x).toBeLessThan(9);
  });
});

describe("걸어서 물에 들어가기", () => {
  const SEA: WaterModel = {
    groundHeight: (x) => (x > 4 ? -1.5 : 1),
    offshore: (x) => Math.max(0, x - 3.2),
  };
  const SHORE: NavGrid = buildNavGrid(
    FIELD_SPEC,
    (x) => x < 4,
    DEFAULT_MOVE.radius,
  );

  it("점프하지 않아도 물가로 걸어 들어간다", () => {
    /**
     * ⚠ 예전엔 걸어다닐 때 **땅만** 갈 수 있었다. 그래서 물에 들어가려면
     *   물가에서 뛰어야 했다 — 헤엄이라는 기능이 있는데 들어가는 방법이
     *   점프뿐인 건 아무도 못 알아챈다.
     */
    const state = createPlayerState(2, 0);
    for (let i = 0; i < 200; i += 1) {
      stepPlayer(state, walk([1, 0]), FIXED_DT, DEFAULT_MOVE, SHORE, SEA);
    }
    expect(state.x).toBeGreaterThan(4);
    expect(state.swimming).toBe(true);
  });

  it("나무는 여전히 막는다", () => {
    // 물만 통과시킨다. 안 그러면 걸어서 야자수를 뚫고 지나간다.
    const state = createPlayerState(0, 0);
    for (let i = 0; i < 200; i += 1) {
      stepPlayer(
        state,
        walk([1, 0]),
        FIXED_DT,
        DEFAULT_MOVE,
        PILLAR,
        DRY_WORLD,
      );
    }
    expect(canStandAt(PILLAR, state.x, state.z)).toBe(true);
  });
});
