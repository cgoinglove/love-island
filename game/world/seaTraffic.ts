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
 *   1. 육지를 피해야 한다. 섬은 하트라 북쪽 봉우리가 x=±40 근처에서 z=-89 까지
 *      밀고 나온다(x=±27 에서 z=-59). 그보다 안쪽 항로는 배가 뭍으로 올라간다.
 *   2. **수평선 안쪽이어야 한다.** 곡률이 거리 제곱으로 바다를 접어 내리므로,
 *      눈높이 3.2m(의자에 앉았을 때)에서 보이는 바다는 49m 까지다. 그보다 먼
 *      배는 수평선 너머라 아예 없는 것과 같다 — 의자 카메라(z=-56)에서
 *      z=-86 이 그 한계이고, 봉우리를 피하는 z=-66 이 그 사이에 넉넉히 들어간다.
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
  { z: -48, speed: 3.1, direction: 1, phase: 0.42, scale: 0.85 },
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
  /**
   * 0 이면 안 보이고 1 이면 또렷하다.
   *
   * ⚠ 항로 끝에서 배는 **되돌아간다** — 오른쪽 끝에 닿은 배가 다음 프레임에
   *   왼쪽 끝에 있다. 그 순간이 화면 밖이면 문제가 없지만, 보는 사람이 섬
   *   어디에 서 있느냐에 따라 화면이 따라 움직이므로 "늘 밖" 이 보장되지 않는다.
   *   되돌아가기 전후로 흐려두면 어디서 보든 **안개에 녹아드는** 것으로 보인다.
   */
  readonly fade: number;
}

/** 끝에서 흐려지기 시작하는 거리(m). */
const FADE_MARGIN = 26;

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
      fade: Math.min(1, (LANE_SPAN - Math.abs(x)) / FADE_MARGIN),
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
const SCHOOLS: readonly Patrol[] = [
  { offshore: 4.5, period: -95, phase: 0.42 },
  { offshore: 9, period: 128, phase: 0.11 },
  { offshore: 6.5, period: -164, phase: 0.73 },
];

export function schoolsAt(seconds: number): FinSighting[] {
  return SCHOOLS.map((school, index) => patrolAt(school, seconds, index));
}

// ── 모래밭의 꽃게 ───────────────────────────────────

/**
 * 꽃게는 **물가를 따라 옆으로** 걷는다.
 *
 * 상어와 같은 방식으로 해안선에서 좌표를 뽑되, 물이 아니라 **뭍 쪽으로**
 * 조금 들어온 자리다. 그러면 어느 각도에 있든 늘 모래밭 위이고,
 * 지형이 바뀌어도 따라온다 — 손으로 좌표를 박으면 섬 크기를 바꿀 때마다
 * 바다 한가운데나 잔디밭에서 게가 걸어다닌다.
 *
 * 게는 옆으로 걷는다. 진행 방향에 몸을 90° 틀어 놓는 게 그 표현이다.
 */
const CRAB_WALKS: readonly Patrol[] = [
  { offshore: -2.2, period: 210, phase: 0.08 },
  { offshore: -3.4, period: -260, phase: 0.55 },
  { offshore: -1.6, period: 320, phase: 0.77 },
  { offshore: -2.8, period: -178, phase: 0.31 },
  { offshore: -4.2, period: 244, phase: 0.92 },
];

export function crabsAt(seconds: number): FinSighting[] {
  return CRAB_WALKS.map((walk, index) => {
    const spot = patrolAt(walk, seconds, index);
    /**
     * 게걸음. 몸은 옆을 보고 가되, 몇 초에 한 번 방향을 홱 바꾼다 —
     * 늘 같은 쪽으로만 가면 그건 컨베이어 벨트에 얹힌 물건이다.
     */
    const flip = Math.sin(seconds * 0.35 + index * 2.4) > 0 ? 1 : -1;
    return { ...spot, yaw: spot.yaw + (Math.PI / 2) * flip };
  });
}

// ── 튀어오르는 물고기 ────────────────────────────────

/** 물고기가 한 번 튀어오르는 간격(초). */
const JUMP_PERIOD = 2.2;
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

// ── 고래 ────────────────────────────────────────────

/**
 * 하루에 **두 번**, 낮에 한 번 밤에 한 번 고래가 지나간다.
 *
 * ── 왜 상시가 아닌가 ──
 * 배·상어·물고기와는 성격이 다르다. 저것들은 바다가 살아 있다는 **배경**이라
 * 늘 돌아도 되지만, 20m 짜리 고래가 늘 앞바다에 있으면 그건 사건이 아니라
 * 풍경이고, 두 번째 보는 순간 아무도 안 쳐다본다. 하루 두 번이면 앉아 있는
 * 3분 안에 볼 수도 못 볼 수도 있다 — 못 볼 수 있어야 봤을 때 사건이 된다.
 *
 * 낮과 밤에 한 번씩인 건 같은 장면을 **두 가지 빛으로** 보여주기 위해서다.
 * 밤 고래는 실루엣만 보이고 분수만 하얗게 선다.
 *
 * 시각이 정하므로 옆 사람과 같은 순간에 같은 걸 본다 — 통신은 0 바이트다.
 */
const WHALE_SHOWS: readonly number[] = [0.22, 0.78];
/** 한 번의 쇼가 걸리는 시간(초). */
const WHALE_SECONDS = 30;
/**
 * 다니는 깊이(z). 항로(-48)보다 **뒤**다.
 *
 * ⚠ 세 겹 뒤다 — 항로(-48) · 깃발(-66) 다음이 고래이고, 그 뒤가 먼 섬이다.
 *   의자 카메라에서 108m. 이 거리에서 곡률이 바다를 15m 끌어내리므로
 *   **물 위로 나온 부분만** 보인다. 30m 짜리를 여기 두면 화면에서는
 *   가까운 15m 짜리와 비슷한 크기인데, 배와 깃발이 그 앞에 있어서
 *   "얼마나 멀리 있는 게 저만큼 크다" 가 읽힌다 — 웅장함은 크기가 아니라
 *   크기와 거리의 조합이다.
 *
 * ⚠ 더 높이 뛰게 할 수는 없다. 이 거리에서 20m 를 넘게 솟으면 카메라가
 *   쓸 수 있는 하늘(수평선 위 10°)을 넘어 코가 화면 밖으로 잘린다.
 */
const WHALE_Z = -112;

export interface WhaleSighting {
  /** 몇 번째 쇼인가. 같은 물보라를 두 번 터뜨리지 않으려고 호출부가 기억한다. */
  readonly key: number;
  readonly x: number;
  readonly z: number;
  readonly yaw: number;
  /** 수면 기준 높이(m). 음수면 물속이다. */
  readonly y: number;
  readonly pitch: number;
  readonly roll: number;
  /**
   * 지금 어느 대목인가. 0 접근 · 1·2 분수 · 3 잠수 · 4 도약 · 5 착수 · 6 퇴장.
   *
   * 물보라와 분수는 **대목이 바뀌는 순간**에 한 번씩 터진다. 시간으로 재면
   * 프레임이 걸러진 사이에 그 순간을 통째로 건너뛴다.
   */
  readonly stage: number;
}

/** 0→1 을 부드럽게. 시작과 끝의 속도가 0 이라 몸이 홱 꺾이지 않는다. */
function ease(t: number): number {
  const c = Math.min(Math.max(t, 0), 1);
  return c * c * (3 - 2 * c);
}

/**
 * 0 접근 · 1 분수 · 2 헤엄 · 3 잠수 · 4 도약 · 5 착수 · 6 퇴장.
 *
 * ⚠ 분수는 **한 번**이다. 두 번 뿜게 했더니 둘 다 어중간해졌다 —
 *   100m 밖에서 벌어지는 일이라 눈길을 끄는 데 한 번은 필요하고,
 *   그 한 번이 크면 두 번째는 방해만 된다.
 */
function stageOf(p: number): number {
  if (p < 0.2) return 0;
  if (p < 0.3) return 1;
  if (p < 0.42) return 2;
  if (p < 0.62) return 3;
  if (p < 0.84) return 4;
  if (p < 0.9) return 5;
  return 6;
}

/**
 * 지금 물 위에 고래가 있으면 그 자세.
 *
 * 한 번의 쇼는 **떠오름 → 분수 두 번 → 꼬리 들고 잠수 → 크게 도약 → 착수** 다.
 * 도약을 마지막에 두는 건 앞의 20초가 전부 그걸 위한 **예고**이기 때문이다 —
 * 분수를 보고 고개를 돌린 사람이 도약을 본다.
 */
export function whaleAt(seconds: number, cycle: number): WhaleSighting | null {
  for (const [index, at] of WHALE_SHOWS.entries()) {
    const since = seconds - at * cycle;
    const round = Math.floor(since / cycle);
    const local = since - round * cycle;
    if (local < 0 || local > WHALE_SECONDS) continue;

    const p = local / WHALE_SECONDS;

    /**
     * 등이 수면에 걸친 높이.
     *
     * ⚠ 이 거리에서는 **물 밖에 나온 만큼만** 보인다. 곡률이 바다를 15m
     *   끌어내리므로 수평선 위로 얼굴을 내미는 건 해수면보다 높은 부분뿐이고,
     *   가까이 있을 때처럼 등을 살짝만 내놓으면 아무것도 안 보인다.
     */
    const CRUISE = 1.1;
    let y = -6 + ease(p / 0.16) * (CRUISE + 6);
    let pitch = 0;

    if (p > 0.4) {
      // 꼬리를 들고 내려간다. 머리가 먼저 들어가므로 앞으로 숙인다.
      const dive = ease((p - 0.4) / 0.2);
      y = CRUISE - dive * 9;
      pitch = dive * 0.75;
    }
    if (p > 0.62) {
      /**
       * 도약. 물속에서 속도를 붙여 비스듬히 솟았다가 옆으로 넘어지며 떨어진다.
       * 올라가는 데 걸리는 시간이 내려오는 것보다 길어야 **무겁게** 보인다.
       */
      const rise = ease((p - 0.62) / 0.16);
      const fall = ease((p - 0.78) / 0.08);
      /**
       * ⚠ 높이 한계는 거리가 정한다. 카메라가 수평선 위로 쓸 수 있는 하늘이
       *   10° 뿐이라, 108m 밖이면 **꼭대기가 20m** 를 넘는 순간 잘린다.
       *   30m 짜리가 48° 로 서면 코가 그 언저리다 — 여기가 상한이다.
       */
      y = -9 + rise * 13.5 - fall * 15;
      pitch = -0.6 * rise + fall * 1.1;
    }
    if (p > 0.9) {
      y = Math.min(y, -1.5 - ease((p - 0.9) / 0.1) * 6);
      pitch = 0.2;
    }

    /**
     * 헤엄치는 흔들림.
     *
     * ⚠ 이게 없으면 **죽은 고래**다. 자리만 옮겨 놓으면 30m 짜리가 수면을
     *   미끄러져 지나가는 그림이 되는데, 그건 헤엄치는 게 아니라 떠내려가는
     *   것이다. 물 위에 있는 동안 몸이 오르내리고 고개가 같이 끄덕여야 한다.
     *   꼬리는 그리는 쪽이 따로 젓는다(SeaLife).
     */
    if (p < 0.42) {
      const stroke = seconds * 1.25;
      y += Math.sin(stroke) * 0.42;
      pitch += Math.cos(stroke) * 0.1;
    }

    return {
      key: round * WHALE_SHOWS.length + index,
      /**
       * 서→동.
       *
       * ⚠ 도약하는 자리를 **깃발에서 비켜** 놓는다. 한가운데로 잡았더니
       *   15m 짜리가 배너 기둥 사이에서 솟아 둘 다 못 보는 그림이 됐다.
       *   분수는 가운데(x≈-5)에서 뿜고 도약은 오른쪽(x≈18)에서 한다 —
       *   먼저 눈길을 끌고 그 다음에 옆에서 터지는 순서다.
       */
      x: -16 + p * 44,
      z: WHALE_Z,
      yaw: -Math.PI / 2,
      y,
      pitch,
      /**
       * 도약하면서 몸을 조금 튼다. 90° 눕히면 옆구리로 떨어지는 그림이 되는데,
       * 그러면 정면에서 볼 때 몸통이 통째로 넓게 퍼져 고래가 아니라 판이 된다.
       */
      roll: p > 0.7 ? ease((p - 0.7) / 0.18) * 0.35 : 0,
      stage: stageOf(p),
    };
  }
  return null;
}
