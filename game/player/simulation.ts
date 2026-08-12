import {
  dampAngle,
  lengthXZ,
  lerpAngle,
  moveToward,
  normalizeXZ,
  yawFromDirection,
} from "@/game/core/coords";
import { canStandAt, type NavGrid } from "@/game/core/nav/grid";
import { PLAYER_RADIUS } from "@/shared/constants";
import type { Vec2XZ } from "@/shared/types";

/**
 * 캐릭터 이동 모델. three 도 react 도 모르는 순수 로직이다.
 *
 * 렌더링에서 분리해두면 두 가지가 공짜로 따라온다:
 *  1. vitest 로 "나무에 박으면 속도가 0이 되는가", "이단 점프가 되는가" 를 실제로 검증할 수 있다
 *  2. 나중에 서버 사이드 검증(같은 함수를 워커에서 돌려 위치 치팅 확인)에 재사용된다
 */

export interface MoveConfig {
  /** 걷기 최고 속도 (m/s). */
  readonly maxSpeed: number;
  /** 달리기 배수. Shift 를 누르면 maxSpeed 에 이만큼 곱한다. */
  readonly sprintMultiplier: number;
  /** 입력이 있을 때 가속도 (m/s²). 높을수록 반응이 즉각적이고 낮을수록 묵직하다. */
  readonly accel: number;
  /** 입력이 없을 때 감속도 (m/s²). accel 보다 크면 딱 멈추고, 작으면 미끄러진다. */
  readonly friction: number;
  /** 회전 감쇠율 (1/s). 클수록 빨리 돈다. */
  readonly turnLambda: number;
  /** 캐릭터 반지름 (m). 충돌 판정에 쓴다. */
  readonly radius: number;
  /** 점프 시작 속도 (m/s). 최고 높이 = jumpSpeed² / (2·gravity) */
  readonly jumpSpeed: number;
  /** 중력 (m/s²). 현실의 9.8 은 게임에선 너무 둔하게 느껴진다. */
  readonly gravity: number;
}

/**
 * 이동 기본값 — 튜닝 패널 슬라이더의 **최댓값**으로 맞춰둔 것이다.
 *
 * 이 섬은 반지름 26m 라 걷기 10m/s · 달리기 3배면 2초면 가로지른다. 산책이 아니라
 * 질주에 가깝지만, 그게 요청받은 값이다. 되돌리려면 개발 서버의 "이동" 패널에서
 * 슬라이더를 내려보고 마음에 드는 숫자를 여기 적으면 된다 — 그러라고 만든 패널이다.
 */
export const DEFAULT_MOVE: MoveConfig = {
  maxSpeed: 10,
  sprintMultiplier: 3,
  accel: 60,
  friction: 80,
  turnLambda: 40,
  radius: PLAYER_RADIUS,
  jumpSpeed: 12,
  gravity: 40,
};

/**
 * 시뮬레이션 상태. React state 가 아니다 — 이 객체는 프레임마다 제자리에서 변형된다.
 * 60Hz 로 setState 를 부르는 순간 리렌더가 프레임을 잡아먹는다. (기획서 §4.1)
 */
export interface PlayerState {
  x: number;
  z: number;
  /** 지면 위 높이(m). 0 이면 땅에 붙어 있다. 지형 높이는 렌더링에서 더한다. */
  y: number;
  vx: number;
  vz: number;
  vy: number;
  yaw: number;
  grounded: boolean;
  /**
   * 물에 빠져 있는가.
   *
   * 상태를 따로 주고받지 않는다 — **좌표만 있으면 각자 계산할 수 있다**(물 위인가).
   * 그래서 남이 물에 빠진 것도 통신 한 바이트 없이 그대로 보인다.
   */
  swimming: boolean;
}

/** 한 스텝에 들어가는 조작 의도. 키보드든 탭이든 조이스틱이든 여기로 모인다. */
export interface MoveIntent {
  axis: Vec2XZ;
  jump: boolean;
  sprint: boolean;
}

export const IDLE_INTENT: MoveIntent = {
  axis: [0, 0],
  jump: false,
  sprint: false,
};

export function createPlayerState(x = 0, z = 0, yaw = 0): PlayerState {
  return {
    x,
    z,
    y: 0,
    vx: 0,
    vz: 0,
    vy: 0,
    yaw,
    grounded: true,
    swimming: false,
  };
}

/**
 * 헤엄칠 때의 속도 배수. 걷는 것보다 확실히 느려야 물에 빠진 게 **사고**로 읽힌다.
 */
const SWIM_SPEED = 0.34;

/**
 * 물이 어디에 얼마나 있는지 알려주는 창구.
 *
 * ⚠ 섬의 지형 함수를 여기서 직접 부르지 않는다. 이 파일이 three 도 react 도
 *   모른다는 게 요점인데, **섬의 모양까지 알기 시작하면** 합성 그리드로 하던
 *   테스트가 통째로 무너진다 — 실제로 그렇게 고쳤다가 "빈 벌판에서 달리기" 테스트가
 *   깨졌다. 벌판의 x=45 가 진짜 섬에서는 바다였기 때문이다.
 *
 * 물을 밖에서 넣어주면 시뮬레이션은 여전히 순수하고, 테스트는 원하는 물을 만들어
 * 쓸 수 있다. 실제 섬의 구현은 game/player/water.ts 에 있다.
 */
export interface WaterModel {
  /** 이 자리의 지형 높이(m). 0 이하면 물이다. */
  groundHeight(x: number, z: number): number;
  /**
   * 물가에서 얼마나 나갔나(m). 음수면 아직 뭍이다.
   *
   * 헤엄 범위를 이걸로 판정한다. 단순히 "여기 헤엄칠 수 있나" 만 물으면
   * **범위 밖에 떨어진 사람이 영영 못 움직인다** — 열기구에서 먼바다로 뛰어내리면
   * 사방이 다 막혀 물 위에 굳는다. 거리로 물으면 "안쪽으로 오는 건 언제나 허용"
   * 이라는 규칙을 쓸 수 있고, 그게 밖으로 나가려는 걸 막는 조류 역할을 한다.
   */
  offshore(x: number, z: number): number;
}

/** 물이 없는 세계. 테스트 기본값이자, 물을 안 넘긴 호출부의 안전한 동작이다. */
export const DRY_WORLD: WaterModel = {
  groundHeight: () => 1,
  offshore: () => Number.POSITIVE_INFINITY,
};

/**
 * 물가에서 이만큼까지만 헤엄쳐 나갈 수 있다(m).
 *
 * ⚠ 취향이 아니라 **통신 계약** 때문이다. 좌표는 ±140 까지만 받는다
 *   (shared/presence). 섬에서 가장 먼 물가가 반지름 121 이라, 여기를 넉넉히 잡으면
 *   헤엄쳐 나간 사람의 좌표가 범위를 벗어나 위치 전송이 통째로 400 으로 튕긴다.
 *   화면에는 "나만 안 움직이는" 것으로 보이고 원인을 찾기 아주 어렵다.
 */
export const SWIM_LIMIT = 4;

/** 이 높이 아래는 물로 본다. island.isLandAt 과 같은 기준이다. */
const WATER_LEVEL = 0.1;

/**
 * 이 자리에서 몸이 놓이는 높이(지형 기준 m).
 *
 * 땅에서는 0 — 지형 높이는 렌더링이 더한다. 물에서는 **수면까지 떠오른다**:
 * 지형이 -1.6m 면 1.6 을 줘서 월드 높이가 0(해수면)이 되게 한다.
 * 이게 없으면 물에 빠진 사람이 바닥에 서 있게 된다.
 */
function floorHeight(water: WaterModel, x: number, z: number): number {
  const ground = water.groundHeight(x, z);
  return ground > WATER_LEVEL ? 0 : -ground;
}

/**
 * 헤엄쳐(또는 날아서) 갈 수 있는 자리인가.
 *
 * ⚠ "막힌 칸이 아니면 통과" 로 쓰면 안 된다. 그러면 공중에 뜬 동안 야자수와
 *   게시판을 뚫고 지나간다 — 네비 그리드가 막아둔 건 물만이 아니기 때문이다.
 *   뚫고 지나가도 되는 건 물뿐이라, 물인지를 직접 묻는다.
 *
 * ⚠ **안쪽으로 오는 건 언제나 허용한다.** 범위만 보면 어쩌다 멀리 떨어진 사람이
 *   (열기구에서 뛰어내리거나 세게 밀쳐져서) 사방이 막힌 채 물 위에 굳는다.
 *   나가는 것만 막으면 바다가 감옥이 아니라 조류가 된다.
 */
function canFloatAt(
  grid: NavGrid,
  water: WaterModel,
  x: number,
  z: number,
  fromX: number,
  fromZ: number,
): boolean {
  if (canStandAt(grid, x, z)) return true;
  const to = water.offshore(x, z);
  return to < SWIM_LIMIT || to < water.offshore(fromX, fromZ);
}

export function copyPlayerState(from: PlayerState, to: PlayerState): void {
  to.x = from.x;
  to.z = from.z;
  to.y = from.y;
  to.vx = from.vx;
  to.vz = from.vz;
  to.vy = from.vy;
  to.yaw = from.yaw;
  to.grounded = from.grounded;
}

/**
 * 밖에서 속도를 밀어 넣는다. 밀치기(넉백)에 쓴다.
 *
 * 위치를 직접 옮기지 않고 **속도만 준다**. 그래야 넉백이 벽 충돌·마찰 같은
 * 기존 규칙을 그대로 통과하고, 상대가 나를 벽 너머로 밀어 넣을 수 없다.
 */
export function applyImpulse(
  state: PlayerState,
  dx: number,
  dz: number,
  dy = 0,
): void {
  state.vx += dx;
  state.vz += dz;
  if (dy !== 0) {
    state.vy += dy;
    state.grounded = false;
  }
}

/**
 * 고정 스텝 한 번. state 를 제자리에서 변형한다 (스텝마다 객체를 새로 만들지 않기 위해).
 *
 * @param dt 항상 FIXED_DT. 가변 delta 를 넣으면 이 함수의 존재 이유가 사라진다
 */
export function stepPlayer(
  state: PlayerState,
  intent: MoveIntent,
  dt: number,
  config: MoveConfig,
  grid: NavGrid,
  water: WaterModel = DRY_WORLD,
): void {
  const [dirX, dirZ] = normalizeXZ(intent.axis[0], intent.axis[1]);
  const hasInput = dirX !== 0 || dirZ !== 0;

  /**
   * 축의 **길이가 세기**다. 살짝 밀면 살살 걷는다.
   *
   * 예전엔 방향만 쓰고 길이를 버렸다. 키보드는 어차피 켜짐/꺼짐이라 티가 안 났는데,
   * 조이스틱에서는 **손가락을 얼마나 밀든 늘 최고 속도**였다 — 폰에서 이동이
   * 너무 빠르다고 느껴진 이유의 절반이 이것이다. 살살 걷는 방법이 아예 없었다.
   *
   * 1 을 넘는 건 자른다. 키보드 대각선은 (1,1) 이라 길이가 1.41 이고,
   * 그걸 그대로 쓰면 대각선으로 갈 때만 빨라진다.
   */
  const strength = Math.min(1, lengthXZ(intent.axis[0], intent.axis[1]));
  const topSpeed =
    config.maxSpeed *
    (intent.sprint ? config.sprintMultiplier : 1) *
    (state.swimming ? SWIM_SPEED : 1);
  /** 지금 이 입력이 향하는 속도. 세기를 여기에만 곱한다 — 아래 상한에는 안 곱한다. */
  const driveSpeed = topSpeed * strength;

  if (hasInput) {
    const step = config.accel * dt;
    state.vx = moveToward(state.vx, dirX * driveSpeed, step);
    state.vz = moveToward(state.vz, dirZ * driveSpeed, step);
  } else {
    // 공중에서는 마찰이 거의 없어야 점프가 "날아가는" 느낌이 난다.
    const step = config.friction * dt * (state.grounded ? 1 : 0.12);
    state.vx = moveToward(state.vx, 0, step);
    state.vz = moveToward(state.vz, 0, step);
  }

  /**
   * ⚠ 여기 속도 상한이 있었다. 그리고 **그게 넉백을 먹고 있었다.**
   *
   * 원래 목적은 "대각선으로 두 축이 동시에 최고 속도에 닿으면 √2 배 빨라진다" 였는데,
   * 축을 정규화해 방향으로 쓰는 지금은 그 일이 애초에 안 일어난다 —
   * `dirX·drive, dirZ·drive` 의 길이는 언제나 정확히 drive 다. 상한은 남은 흔적이었다.
   *
   * 남아 있는 동안 한 일은 하나뿐이었다: 밀쳐진 사람의 속도를 공중에서 25m/s 로,
   * 착지하는 순간 10m/s 로 잘라버리는 것. 그래서 `SHOVE_IMPULSE` 를 26 에서 32 로
   * 올려도 날아가는 거리가 7.8m 에서 8.5m 로밖에 안 늘었다 — **숫자를 아무리 만져도
   * 안 통하는 이유가 여기 있었다.** 밀려나는 속도를 멈추는 일은 마찰이 하면 된다.
   *
   * (기존 테스트가 `vx > maxSpeed * 1.5` 만 봤기 때문에 25 로 잘려도 통과했다.
   *  지금은 "멀리 날아간다" 가 거리로 본다.)
   */

  // ── 수직 ──────────────────────────────────────────────
  // 물에서는 못 뛴다. 허우적대는 사람이 제자리 점프를 하면 그건 물이 아니다.
  if (intent.jump && state.grounded && !state.swimming) {
    state.vy = config.jumpSpeed;
    state.grounded = false;
  }
  const floor = floorHeight(water, state.x, state.z);
  if (!state.grounded) {
    state.vy -= config.gravity * dt;
    state.y += state.vy * dt;
    if (state.y <= floor) {
      state.y = floor;
      state.vy = 0;
      state.grounded = true;
    }
  } else {
    /**
     * 땅에 붙어 있는 동안에도 바닥 높이는 따라가야 한다.
     * 물가를 헤엄쳐 나가면 바닥(수면)이 점점 높아지는데, 이걸 안 따라가면
     * 몸이 물속으로 가라앉는다.
     */
    state.y = floor;
  }

  // ── 수평 ──────────────────────────────────────────────
  /**
   * 갈 수 있는 자리인가 — **땅이거나 들어가도 되는 물**이다.
   *
   * ⚠ 한때 걸어다닐 때는 땅만, 공중이거나 헤엄칠 때만 물을 허용했다. 그러다 보니
   *   물에 들어가려면 **뛰어서 빠져야** 했고(물가에서 점프), 헤엄쳐 나올 때는
   *   걸을 수도 헤엄칠 수도 없는 얇은 띠에 턱 걸렸다 — 물은 지형 높이 0.1m 에서
   *   끝나는데 걸을 수 있는 칸은 거기서 몸 두께만큼 더 안쪽부터 시작하기 때문이다
   *   (buildNavGrid 의 radius).
   *
   *   상태를 나눌 이유가 애초에 없었다. 물가로 걸어 들어가면 물에 잠기는 게
   *   당연하고, 나올 때도 그냥 걸어 나오면 된다. 조건 하나로 합치니 두 문제가
   *   같이 사라졌다.
   *
   * ⚠ 야자수와 게시판은 여전히 막는다 — canFloatAt 이 통과시키는 건 **물**뿐이다.
   */
  const passable = (x: number, z: number) =>
    canFloatAt(grid, water, x, z, state.x, state.z);

  // 축을 하나씩 따로 옮긴다. 두 축을 동시에 판정하면 벽에 비스듬히 부딪혔을 때
  // 통째로 막혀서 딱 붙어버린다. 따로 하면 막힌 축만 죽고 나머지 축으로 미끄러진다.
  const nextX = state.x + state.vx * dt;
  if (passable(nextX, state.z)) {
    state.x = nextX;
  } else {
    state.vx = 0;
  }

  const nextZ = state.z + state.vz * dt;
  if (passable(state.x, nextZ)) {
    state.z = nextZ;
  } else {
    state.vz = 0;
  }

  /**
   * 물에 떠 있는가는 **지금 발밑이 물인가**로 정한다.
   * 따로 켜고 끄는 상태로 두면 반드시 어딘가에서 어긋난다 — 물 위에서 걷거나
   * 땅 위에서 허우적대는 식으로. 좌표에서 유도하면 그런 경우가 아예 없다.
   */
  state.swimming =
    state.grounded && water.groundHeight(state.x, state.z) <= WATER_LEVEL;

  // 서 있을 때 미세한 잔속도로 캐릭터가 부들거리지 않도록 임계값을 둔다.
  if (lengthXZ(state.vx, state.vz) > 0.05) {
    state.yaw = dampAngle(
      state.yaw,
      yawFromDirection(state.vx, state.vz),
      config.turnLambda,
      dt,
    );
  }
}

export interface RenderPose {
  x: number;
  z: number;
  y: number;
  yaw: number;
}

/**
 * 렌더 보간. 시뮬레이션은 1/60 로 뚝뚝 끊겨 진행되지만 화면은 그 사이를 메워야 한다.
 * alpha 는 loop.ts 의 planSteps 가 돌려주는 잔량 비율.
 * out 을 받아서 제자리에 쓰는 이유는 역시 프레임당 할당을 피하기 위해서다.
 */
export function interpolatePose(
  prev: PlayerState,
  next: PlayerState,
  alpha: number,
  out: RenderPose,
): void {
  out.x = prev.x + (next.x - prev.x) * alpha;
  out.z = prev.z + (next.z - prev.z) * alpha;
  out.y = prev.y + (next.y - prev.y) * alpha;
  out.yaw = lerpAngle(prev.yaw, next.yaw, alpha);
}
