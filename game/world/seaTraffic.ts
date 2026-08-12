import { shoreRadiusAt } from "@/game/core/island";

/**
 * 바다에서 저절로 벌어지는 것들 — 지나가는 배, 물살을 가르는 지느러미, 튀어오르는 물고기.
 *
 * ── 왜 시계에서 유도하나 ──
 * 밤 불꽃놀이와 같은 이유다(nightShow). 누군가 "지금 배 지나감" 이라고 알리는
 * 방식이면 그 사람이 나가는 순간 바다가 죽고, 늦게 들어온 사람은 남들이 뭘 보고
 * 있는지 모른다. **시각만으로 정해지면 아무도 책임지지 않아도 모두가 같은 순간에
 * 같은 걸 본다.** 통신은 0 바이트다.
 *
 * 앉아서 같이 보는 자리를 만든 이상(features/sunset) 이건 선택이 아니다 —
 * 옆 사람과 "저 배 봐" 가 성립하려면 그 배가 두 화면에서 같은 자리에 있어야 한다.
 *
 * 순수 함수라 "배가 육지 위로 지나가지 않는가" 를 눈이 아니라 테스트로 확인한다.
 *
 * ⚠ 파일 이름이 SeaLife.tsx 와 다른 건 실수가 아니다. 대소문자만 다른 두 파일은
 *   맥·윈도의 파일시스템에서 같은 이름으로 취급돼 타입스크립트가 통째로 막는다.
 *   nightShow.ts ↔ Reactions.tsx 와 같은 짝이다 — 시간표와 그리는 쪽은 다른 파일이다.
 */

/** 결정적 난수. 같은 슬롯 번호면 어디서 돌리든 같은 값이 나온다. */
function hashUnit(slot: number, salt: number): number {
  let h = Math.imul(slot ^ salt, 0x9e3779b1);
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b);
  h ^= h >>> 13;
  return (h >>> 0) / 4294967296;
}

// ── 배 ──────────────────────────────────────────────

/**
 * 항로.
 *
 * ⚠ z 값은 취향이 아니라 **두 개의 제약이 만나는 자리**다.
 *
 *   1. 육지를 피해야 한다. 섬은 하트라 북쪽 봉우리가 x=±20 근처에서 z=-30 까지
 *      밀고 나온다. z=-31 항로는 여유가 1m 밖에 없어서 배가 바위를 스친다.
 *   2. **수평선 안쪽이어야 한다.** 곡률이 거리 제곱으로 바다를 접어 내리므로,
 *      눈높이 2.8m(앉았을 때)에서 보이는 바다는 46m 까지다. 그보다 먼 배는
 *      수평선 너머라 아예 없는 것과 같다 — 의자에서 z=-59 가 그 한계다.
 *
 * 셋을 다른 거리에 두는 건 원근을 만들기 위해서다. 가까운 배는 작고 빠르게
 * 지나가고, 먼 배는 크고 느리게 미끄러진다.
 */
interface Lane {
  readonly z: number;
  /** m/s. 실제 배 속도(3~5 m/s ≈ 6~10노트)와 얼추 맞다. */
  readonly speed: number;
  /** 1 이면 서→동, -1 이면 동→서. */
  readonly direction: 1 | -1;
  /** 0~1. 세 배가 한 줄로 나란히 다니지 않게 어긋내는 값. */
  readonly phase: number;
  /** 배 크기 배수. 먼 항로일수록 크게 잡아야 원근이 맞는다. */
  readonly scale: number;
}

/**
 * ⚠ 한 척이다. 셋을 띄웠더니 좁은 바다에 배가 줄지어 다니는 **항구**가 됐다 —
 *   조용한 섬 앞바다에 어울리는 그림이 아니고, 세 척이 각자 다른 거리에 있으니
 *   시선이 어디에도 머물지 않았다. 하나면 그 하나를 보게 된다.
 *
 * 크기도 한 번 크게 잡았다가 되돌렸다. 의자에서 항로까지가 30m 남짓이라
 * 10m 짜리 배는 화면 가로의 5분의 1을 차지하며 수평선을 통째로 가린다 —
 * 지나가는 배가 아니라 정박한 배로 보인다. 눈높이가 낮으면(앉으면 2.8m)
 * 수평선이 46m 밖에 안 되므로 항로를 더 멀리 물릴 수도 없다.
 */
const LANES: readonly Lane[] = [
  { z: -44, speed: 3.1, direction: 1, phase: 0.42, scale: 0.85 },
];

/**
 * 항로의 반쪽 길이(m). 이 밖으로 나가면 반대편에서 다시 들어온다.
 *
 * ⚠ 짧을수록 배가 자주 온다. 130m 로 뒀더니 화면에 배가 한 척이라도 있는 시간이
 *   3분의 1 밖에 안 됐다 — 앉아서 한참을 봐도 빈 바다인 적이 더 많았다.
 *   의자에서 보이는 좌우 폭이 항로마다 26~48m 이므로, 되돌아가는 지점을 72m 로
 *   당기면 그 비율이 3분의 2가 된다. 되돌아가는 순간은 여전히 화면 밖이다.
 */
export const LANE_SPAN = 72;

export interface BoatSighting {
  /** 항로 번호. 렌더링 쪽이 배를 다시 만들지 않고 자리만 옮기는 데 쓴다. */
  readonly lane: number;
  readonly x: number;
  readonly z: number;
  /** 뱃머리가 향한 방향(라디안). 캐릭터와 같은 규칙 — 로컬 -Z 가 정면. */
  readonly yaw: number;
  /** 파도에 오르내리는 높이(m). */
  readonly bob: number;
  /** 좌우로 기우는 각(라디안). */
  readonly roll: number;
  readonly scale: number;
}

export function boatsAt(seconds: number): BoatSighting[] {
  return LANES.map((lane, index) => {
    // 0~1 을 한 바퀴로 본다. 끝에 닿으면 반대편에서 다시 들어온다.
    const travel = (seconds * lane.speed) / (LANE_SPAN * 2) + lane.phase;
    const u = travel - Math.floor(travel);
    const x = lane.direction * (u * LANE_SPAN * 2 - LANE_SPAN);

    return {
      lane: index,
      x,
      z: lane.z,
      // 로컬 -Z 가 정면이므로 +x 를 보려면 -90°.
      yaw: lane.direction > 0 ? -Math.PI / 2 : Math.PI / 2,
      /**
       * 파도. 배마다 주기를 어긋내지 않으면 셋이 한 몸처럼 같이 출렁인다 —
       * 그러면 바다가 아니라 컨베이어 벨트로 보인다.
       */
      bob: Math.sin(seconds * 0.9 + index * 2.1) * 0.13 * lane.scale,
      roll: Math.sin(seconds * 0.7 + index * 1.3) * 0.045,
      scale: lane.scale,
    };
  });
}

// ── 지느러미 ─────────────────────────────────────────

/**
 * 상어는 **해안선을 따라** 돈다.
 *
 * 직선으로 다니게 하면 반드시 언젠가 육지를 지난다(섬이 하트라 반지름이 각도마다
 * 두 배 차이 난다). 해안선 함수에서 좌표를 뽑으면 그 문제가 통째로 사라진다 —
 * 어느 각도에 있든 물가에서 정확히 이만큼 떨어진 자리다.
 */
interface Patrol {
  /** 물가에서 떨어진 거리(m). */
  readonly offshore: number;
  /** 한 바퀴 도는 데 걸리는 시간(초). 음수면 반대로 돈다. */
  readonly period: number;
  readonly phase: number;
}

const PATROLS: readonly Patrol[] = [
  { offshore: 8.5, period: 150, phase: 0.2 },
  { offshore: 14, period: -190, phase: 0.65 },
];

export interface FinSighting {
  readonly id: number;
  readonly x: number;
  readonly z: number;
  /** 헤엄치는 방향(라디안). */
  readonly yaw: number;
}

function patrolAt(patrol: Patrol, seconds: number, id: number): FinSighting {
  const turn = seconds / patrol.period + patrol.phase;
  const angle = (turn - Math.floor(turn)) * Math.PI * 2;
  const radius = shoreRadiusAt(angle) + patrol.offshore;
  const x = Math.cos(angle) * radius;
  const z = Math.sin(angle) * radius;

  /**
   * 진행 방향은 조금 앞의 자리에서 뽑는다.
   * 접선을 미분으로 구하면 해안선 급수까지 미분해야 하는데, 반 도 앞을
   * 한 번 더 계산하는 쪽이 짧고 어차피 같은 답이다.
   */
  const ahead = angle + (patrol.period > 0 ? 0.02 : -0.02);
  const aheadRadius = shoreRadiusAt(ahead) + patrol.offshore;
  const dx = Math.cos(ahead) * aheadRadius - x;
  const dz = Math.sin(ahead) * aheadRadius - z;

  return { id, x, z, yaw: Math.atan2(-dx, -dz) };
}

export function finsAt(seconds: number): FinSighting[] {
  return PATROLS.map((patrol, index) => patrolAt(patrol, seconds, index));
}

// ── 물속을 지나가는 무리 ─────────────────────────────

/**
 * 물고기 떼는 상어와 **같은 방식으로** 해안을 따라 돈다.
 *
 * 물이 투명해서 수면 아래가 다 보인다. 지느러미만 지나가고 물속이 비어 있으면
 * 그 투명함이 장점이 아니라 결함이 된다 — 볼 게 없다는 걸 보여줄 뿐이다.
 */
const SCHOOL: Patrol = { offshore: 4.5, period: -95, phase: 0.42 };

export function schoolAt(seconds: number): FinSighting {
  return patrolAt(SCHOOL, seconds, 0);
}

// ── 튀어오르는 물고기 ────────────────────────────────

/** 물고기가 한 번 튀어오르는 간격(초). */
const JUMP_PERIOD = 4.5;
/** 물 밖에 나와 있는 시간(초). */
export const JUMP_SECONDS = 1.05;
/** 튀어오르는 높이(m). */
export const JUMP_HEIGHT = 1.35;

export interface JumpSighting {
  /** 슬롯 번호. 같은 한 번의 도약을 두 번 세지 않으려고 호출부가 기억한다. */
  readonly key: number;
  readonly x: number;
  readonly z: number;
  readonly yaw: number;
  /** 0 = 물 밖으로 나오는 순간, 1 = 다시 잠기는 순간. */
  readonly progress: number;
}

/**
 * 지금 물 밖에 나와 있는 물고기.
 *
 * 슬롯을 4.5초로 자르고 그 안의 **어디쯤에서** 튈지를 다시 해시로 정한다.
 * 정확히 4.5초마다 튀면 그건 물고기가 아니라 메트로놈이다.
 */
export function jumpsAt(seconds: number): JumpSighting[] {
  const out: JumpSighting[] = [];

  // 직전 슬롯도 본다 — 슬롯 끝에 걸쳐 시작한 도약이 다음 슬롯까지 이어진다.
  for (const slot of [
    Math.floor(seconds / JUMP_PERIOD) - 1,
    Math.floor(seconds / JUMP_PERIOD),
  ]) {
    const start =
      slot * JUMP_PERIOD +
      hashUnit(slot, 0x51ed) * (JUMP_PERIOD - JUMP_SECONDS);
    const progress = (seconds - start) / JUMP_SECONDS;
    if (progress < 0 || progress > 1) continue;

    /**
     * 자리도 해안선에서 뽑는다. 북쪽 물가 쪽으로 치우치게 하는 건 카메라가
     * 늘 북쪽을 보기 때문이다 — 뒤에서 튀어오르는 물고기는 없는 것과 같다.
     */
    const angle = -Math.PI + hashUnit(slot, 0x9c17) * Math.PI;
    const radius = shoreRadiusAt(angle) + 3 + hashUnit(slot, 0x2be7) * 9;

    out.push({
      key: slot,
      x: Math.cos(angle) * radius,
      z: Math.sin(angle) * radius,
      // 튀어오르는 방향은 아무래도 좋다. 다만 매번 달라야 한다.
      yaw: hashUnit(slot, 0x3c1d) * Math.PI * 2,
      progress,
    });
  }

  return out;
}

/** 도약 궤적의 높이(m). 0 에서 시작해 가운데서 가장 높고 다시 0 으로 떨어진다. */
export function jumpHeightAt(progress: number): number {
  return Math.sin(progress * Math.PI) * JUMP_HEIGHT;
}

/**
 * 도약 중의 몸 기울기(라디안).
 *
 * 물고기는 나오면서 위를 보고 들어가면서 아래를 본다. 이게 없으면 수평인 채로
 * 위아래로 움직이는 **막대**가 된다 — 도약처럼 보이는 건 궤적이 아니라 각도다.
 */
export function jumpPitchAt(progress: number): number {
  return Math.cos(progress * Math.PI) * 1.1;
}
