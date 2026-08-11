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
  return { x, z, y: 0, vx: 0, vz: 0, vy: 0, yaw, grounded: true };
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
    config.maxSpeed * (intent.sprint ? config.sprintMultiplier : 1);
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
  if (intent.jump && state.grounded) {
    state.vy = config.jumpSpeed;
    state.grounded = false;
  }
  if (!state.grounded) {
    state.vy -= config.gravity * dt;
    state.y += state.vy * dt;
    if (state.y <= 0) {
      state.y = 0;
      state.vy = 0;
      state.grounded = true;
    }
  }

  // ── 수평 ──────────────────────────────────────────────
  // 축을 하나씩 따로 옮긴다. 두 축을 동시에 판정하면 벽에 비스듬히 부딪혔을 때
  // 통째로 막혀서 딱 붙어버린다. 따로 하면 막힌 축만 죽고 나머지 축으로 미끄러진다.
  const nextX = state.x + state.vx * dt;
  if (canStandAt(grid, nextX, state.z)) {
    state.x = nextX;
  } else {
    state.vx = 0;
  }

  const nextZ = state.z + state.vz * dt;
  if (canStandAt(grid, state.x, nextZ)) {
    state.z = nextZ;
  } else {
    state.vz = 0;
  }

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
