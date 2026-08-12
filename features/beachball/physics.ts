import {
  BALL_RADIUS,
  GOAL_CENTER_X,
  GOAL_HALF,
  GOAL_HEIGHT,
  GOAL_Z,
} from "./constants";

/**
 * 비치볼의 물리.
 *
 * ── 왜 순수 함수인가 ──
 * 공은 **모든 사람의 화면에서 같은 자리에 있어야** 하는데, 통신으로 자리를
 * 계속 보내지는 않는다(초당 60번 좌표를 뿌리면 그건 공 하나 때문에 채팅보다
 * 비싼 통로를 새로 까는 것이다). 대신 **찰 때 한 번** 상태를 통째로 보내고
 * 그 뒤로는 각자 같은 계산을 돌린다. 같은 계산이려면 프레임 시간에 의존하면
 * 안 되므로 걸음을 1/60 초로 고정한다 — 60fps 인 사람과 30fps 인 사람이
 * 같은 자리를 보는 건 이 고정 걸음 덕분이다.
 *
 * 지형 높이는 인자로 받는다. 그래야 여기가 game/core 를 몰라도 되고,
 * 시험할 때 평평한 땅을 넣어볼 수 있다.
 */

export interface BallState {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
}

/** 고정 걸음(초). 모두가 같은 값을 써야 같은 자리에 온다. */
export const STEP = 1 / 60;

const GRAVITY = -19;
/** 공기 저항. 비치볼은 가벼워서 실제로도 금방 느려진다. */
const DRAG = 0.55;
/** 튀는 정도. 1 이면 영원히 튄다. */
const BOUNCE = 0.55;
/** 땅에 닿을 때 가로 속도가 깎이는 비율. 이게 없으면 공이 안 멈춘다. */
const GROUND_FRICTION = 0.78;
/** 이보다 느리면 멈춘 것으로 본다(m/s). */
const REST_SPEED = 0.35;

/**
 * 물에 빠진 공.
 *
 * ⚠ 가라앉히면 안 된다. 공이 바다로 나가면 그걸로 놀이가 끝나는데, 정작
 *   바다로 차 넣는 건 놀다 보면 반드시 벌어지는 일이다. 그래서 뜨고,
 *   **뭍 쪽으로 아주 천천히 밀린다** — 아무도 주우러 가지 않아도 돌아온다.
 */
const FLOAT_PULL = 0.55;

export function ballAtRest(state: BallState, ground: number): boolean {
  return (
    state.y <= ground + BALL_RADIUS + 0.02 &&
    Math.hypot(state.vx, state.vy, state.vz) < REST_SPEED
  );
}

/**
 * 한 걸음.
 *
 * `groundAt` 은 그 자리의 땅 높이(물이면 음수). 물 위에서는 수면(0)이 바닥이다.
 */
export function stepBall(
  state: BallState,
  groundAt: (x: number, z: number) => number,
): BallState {
  const next: BallState = { ...state };

  next.vy += GRAVITY * STEP;
  const drag = 1 - DRAG * STEP;
  next.vx *= drag;
  next.vz *= drag;

  next.x += next.vx * STEP;
  next.y += next.vy * STEP;
  next.z += next.vz * STEP;

  const terrain = groundAt(next.x, next.z);
  const afloat = terrain < 0;
  const floor = (afloat ? 0 : terrain) + BALL_RADIUS;

  if (next.y < floor) {
    next.y = floor;
    if (next.vy < 0) next.vy = -next.vy * (afloat ? 0.25 : BOUNCE);
    const friction = afloat ? 0.9 : GROUND_FRICTION;
    next.vx *= friction;
    next.vz *= friction;
    if (Math.abs(next.vy) < 0.6) next.vy = 0;
  }

  if (afloat && next.y <= floor + 0.01) {
    // 물 위에서는 뭍 쪽으로 천천히 밀린다. 섬 한가운데를 향하면 된다.
    const away = Math.hypot(next.x, next.z);
    if (away > 0.001) {
      next.vx -= (next.x / away) * FLOAT_PULL * STEP;
      next.vz -= (next.z / away) * FLOAT_PULL * STEP;
    }
  }

  return next;
}

/**
 * 사람이 공을 찼을 때의 새 속도.
 *
 * 방향은 **사람에서 공으로**다. 바라보는 쪽으로 차게 하면 공을 등지고 서서
 * 밀 수 있는데, 그건 발로 차는 게 아니라 텔레포트다. 부딪힌 자리가 방향을
 * 정해야 몸으로 공을 몰고 가는 맛이 난다.
 */
export function kickBall(
  ball: BallState,
  from: { x: number; z: number },
  speed: number,
): BallState {
  const dx = ball.x - from.x;
  const dz = ball.z - from.z;
  const away = Math.hypot(dx, dz);
  // 정확히 겹쳐 서면 방향이 없다. 그럴 땐 북쪽(골대 쪽)으로 보낸다.
  const nx = away > 0.001 ? dx / away : 0;
  const nz = away > 0.001 ? dz / away : -1;

  const push = 5.5 + Math.min(speed, 6) * 1.35;
  return {
    x: ball.x,
    y: ball.y,
    z: ball.z,
    vx: nx * push,
    // 살짝 띄운다. 굴리기만 하면 화면에서 공이 안 보인다.
    vy: 3.4,
    vz: nz * push,
  };
}

/**
 * 골 판정 — 공이 골대 면을 **북쪽으로 통과**했는가.
 *
 * 한 프레임의 전후를 함께 본다. 공이 빠르면 한 걸음에 골문을 통째로 건너뛰어서,
 * "지금 골문 안에 있나" 로만 재면 세게 찬 골일수록 안 들어간다.
 */
export function crossedGoal(before: BallState, after: BallState): boolean {
  if (!(before.z > GOAL_Z && after.z <= GOAL_Z)) return false;
  const span = before.z - after.z;
  const t = span > 0.0001 ? (before.z - GOAL_Z) / span : 0;
  const x = before.x + (after.x - before.x) * t;
  const y = before.y + (after.y - before.y) * t;
  return Math.abs(x - GOAL_CENTER_X) < GOAL_HALF && y < GOAL_HEIGHT;
}
