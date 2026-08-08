import { Color } from "three";
import { elevationAt } from "@/game/core/island";
import type { ReactionKind } from "@/shared/presence";
import type { ParticleSpec } from "./reactionPool";

/**
 * 버스트 한 번이 만들어내는 입자들.
 *
 * 여기 있는 숫자가 곧 "느낌"이다. 몇 개를 어느 속도로 어디로 뿌리느냐가
 * 축포와 폭죽과 비눗방울을 가른다. 그래서 셰이더가 아니라 이 파일에 모아뒀고,
 * 순수 함수라 테스트로 못박아둘 수 있다.
 *
 * 난수를 인자로 받는다 — 시드를 고정하면 같은 버스트가 나오므로 테스트가 가능하다.
 */

export type Random = () => number;

/** 구 위에 고르게 뿌린다. y 만 균등하게 뽑는 게 정석이다(원기둥 사영). */
function onSphere(random: Random): [number, number, number] {
  const y = random() * 2 - 1;
  const radius = Math.sqrt(Math.max(0, 1 - y * y));
  const angle = random() * Math.PI * 2;
  return [Math.cos(angle) * radius, y, Math.sin(angle) * radius];
}

const HEART_COLORS = ["#ff5d8f", "#ff8fab", "#ff3d6e", "#ffc2d1"];
const CONFETTI_COLORS = [
  "#ff5d8f",
  "#ffd166",
  "#06d6a0",
  "#4cc9f0",
  "#b388ff",
  "#ff9f1c",
];
const FIREWORK_COLORS = ["#ffd166", "#ff5d8f", "#4cc9f0", "#b8ff9f", "#ff9f1c"];

function pick(palette: readonly string[], random: Random): Color {
  const index = Math.min(
    palette.length - 1,
    Math.floor(random() * palette.length),
  );
  // random() 이 정확히 1.0 을 내는 구현도 있어서 index 를 이미 잘라뒀지만,
  // 색이 하나 빠지는 것보다 흰색으로라도 보이는 게 낫다.
  return new Color(palette[index] ?? "#ffffff");
}

/**
 * 하트 — 가슴께에서 피어올라 흔들리며 떠오른다.
 *
 * 중력을 **양수**로 준다. 계속 가속하며 올라가는 대신 공기저항이 잡아줘서
 * 일정 속도로 떠오르는 모양이 된다. 위로 사라지는 게 하트다.
 */
function heartBurst(x: number, z: number, random: Random): ParticleSpec[] {
  const specs: ParticleSpec[] = [];
  for (let i = 0; i < 22; i += 1) {
    const angle = random() * Math.PI * 2;
    const spread = 0.18 + random() * 0.3;
    specs.push({
      ox: x + Math.cos(angle) * spread,
      oy: 1.05 + random() * 0.3,
      oz: z + Math.sin(angle) * spread,
      vx: Math.cos(angle) * 0.35,
      vy: 1.1 + random() * 0.9,
      vz: Math.sin(angle) * 0.35,
      // 부력. 종단 속도 g/k ≈ 0.5m/s 로 천천히 떠오른다.
      drag: 1.15,
      gravity: 0.58,
      life: 2.6 + random() * 1.3,
      // 줄줄이 피어오르되 **처음 몇 개는 즉시** 나와야 한다.
      // 0.045 였을 땐 마지막 하트가 1초 뒤에 태어나서 반응이 굼떠 보였다.
      delay: i * 0.022,
      size: 0.32 + random() * 0.3,
      color: pick(HEART_COLORS, random),
      shape: 0,
      seed: random(),
      floor: 0,
    });
  }
  return specs;
}

/**
 * 색종이 — 위로 뿜었다가 팔랑팔랑 떨어진다.
 *
 * 저항을 세게(2.4) 준 게 핵심이다. 저항이 약하면 자갈처럼 뚝 떨어지고,
 * 세면 공중에 머무는 시간이 길어져 종이처럼 보인다.
 */
function confettiBurst(
  x: number,
  z: number,
  random: Random,
  power = 1,
): ParticleSpec[] {
  const specs: ParticleSpec[] = [];
  for (let i = 0; i < Math.round(150 * power); i += 1) {
    const angle = random() * Math.PI * 2;
    // 위로 좁게 쏘아 올린다. 옆으로 퍼지면 축포가 아니라 폭발이다.
    const tilt = 0.14 + random() * 0.62;
    const speed = 5.2 + random() * 4.2;
    specs.push({
      ox: x,
      oy: 1.3,
      oz: z,
      vx: Math.cos(angle) * tilt * speed,
      vy: speed,
      vz: Math.sin(angle) * tilt * speed,
      /**
       * 저항을 세게(2.6) 준 게 핵심이다. 종단 속도가 g/k ≈ 2.7m/s 로 느려져
       * 종잇조각처럼 팔랑팔랑 내려온다. 저항이 약하면 자갈처럼 뚝 떨어진다.
       */
      drag: 2.6,
      gravity: -7.2,
      life: 3.4 + random() * 1.6,
      delay: random() * 0.16,
      size: (0.15 + random() * 0.13) * power,
      color: pick(CONFETTI_COLORS, random),
      shape: 1,
      seed: random(),
      floor: 0,
    });
  }
  return specs;
}

/**
 * 폭죽이 터지기까지 걸리는 시간(초).
 *
 * 0.95초였다. 물리적으로는 그럴싸했지만 **2를 누르고 1초를 기다리는** 셈이라
 * 조작이 굼뜨게 느껴졌다. 도화선을 절반으로 줄이고 대신 초속을 올려서,
 * 터지는 높이는 그대로 두고 기다리는 시간만 없앴다.
 */
const FUSE_SECONDS = 0.55;
const SHELL_SPEED = 16.4;
const SHELL_GRAVITY = -4;
const SHELL_DRAG = 0.9;
const LAUNCH_Y = 0.8;

/**
 * ⚠ 규모(power)로 **초속을 키우면 안 된다.**
 *
 * 예전엔 speed = SHELL_SPEED * power 였는데, 그 값으로 터지는 높이만 계산하고
 * 정작 올라가는 꼬리는 SHELL_SPEED 로 그렸다. 그래서 밤의 큰 발(power 2~3)은
 * 꼬리가 10m 에서 끊기고 폭발은 25m 에서 일어났다 — 그 높이는 화면 위로 잘려나가
 * **아무도 못 봤다.** "밤 폭죽이 나약하다"의 진짜 정체가 이것이었다.
 *
 * 카메라가 23° 숙이고 세로 화각이 40° 라, 화면에서 하늘로 보이는 띠는
 * 수평 아래 3°~14° 뿐이다. 70m 거리로 환산하면 지면 기준 0.5m ~ 15m.
 * 터지는 높이는 그 한가운데(7~9m)에 있어야 하고, 규모는 **퍼지는 반지름**으로 낸다.
 */
function shellSpeedFor(power: number): number {
  return SHELL_SPEED + (power - 1) * 1.1;
}

/**
 * 별의 공기저항. 퍼지는 반지름이 v₀/k 로 수렴하므로 **이 값이 원의 크기를 정한다.**
 * 반지름을 정하고 거기서 초속을 역산하면, "얼마나 크게 터지나"를 미터로 직접 쓸 수 있다.
 *
 * ⚠ 저항은 크기뿐 아니라 **언제 그 크기가 되는지**도 정한다(시간상수 1/k).
 *   여기서 두 번 헛디뎠다. 1.35 로 두니 원이 다 퍼지는 데 2초가 걸렸고 그때쯤 별은
 *   이미 흐려져서 "작은 폭죽"이 됐다. 그래서 2.4 로 올렸더니 이번엔 **너무 빨리**
 *   터져서 순식간에 지나갔다.
 *
 *   답은 저항이 아니라 **수명**이었다. 1.7(시간상수 0.59초)로 느긋하게 퍼지게 두고,
 *   대신 별이 다 퍼질 때까지 살아 있도록 수명을 늘렸다. 퍼지는 속도와 밝은 시간은
 *   따로 조절해야 하는 값이다.
 */
const STAR_DRAG = 1.7;
const STAR_GRAVITY = -3.2;

/**
 * 터지는 원의 반지름(m).
 *
 * 상한이 있는 건 취향이 아니라 화각이다 — 보이는 하늘 띠가 약 11° 라,
 * 70m 거리에서 지름 14m 를 넘으면 위아래가 프레임 밖으로 잘려 나간다.
 * 그 한계까지는 채운다. 밤의 큰 발은 하늘 띠를 꽉 메워야 "웅장" 이 된다.
 */
function burstRadiusFor(power: number): number {
  return Math.min(2.2 + 1.9 * power, 7.5);
}

/**
 * 셰이더가 쓰는 것과 **같은** 해석해. 껍질이 어디서 터지는지 CPU 도 알아야 한다.
 *
 * 두 곳에 같은 식이 있는 건 위험하지만, 하나는 GLSL 이고 하나는 TS 라 공유할 수가 없다.
 * 대신 테스트가 이 함수를 자유낙하로 검산해서 부호가 뒤집히면 바로 잡는다.
 */
export function travel(
  v0: number,
  gravity: number,
  drag: number,
  t: number,
): number {
  const terminal = gravity / drag;
  const decay = (1 - Math.exp(-drag * t)) / drag;
  return (v0 - terminal) * decay + terminal * t;
}

/**
 * ⚠ 터지는 순간의 **섬광은 없다.**
 *
 * 한때 터진 자리에 흰 불덩이를 얹고 실제 `pointLight` 로 섬 전체를 번쩍이게 했다.
 * 밤바다 사진처럼 그럴싸했지만 화면에서는 색이 날아가 하얀 얼룩이 되고, 그 얼룩이
 * 정작 봐야 할 **원의 모양을 덮었다.** 밝기로 웅장함을 내려던 시도였는데, 웅장함은
 * 밝기가 아니라 퍼지는 크기와 겹치는 발 수에서 나온다.
 *
 * 빼고 나니 광원 둘도 같이 사라져서 모든 머티리얼의 조명 계산이 가벼워졌다.
 */

/**
 * 폭발 한 번 — 그리고 그 안에서 다시 터지는 것들.
 *
 * ── 왜 재귀인가 ──
 * "연쇄의 연쇄" 를 손으로 펼쳐 쓰면 같은 코드가 세 벌 생기고, 층을 하나 더 넣거나
 * 비율을 바꿀 때마다 세 곳을 고쳐야 한다. 층마다 다른 건 **개수 · 크기 · 시점**
 * 세 숫자뿐이라, 그걸 배열로 두고 자기를 부르면 층은 배열 길이가 된다.
 *
 * ── 왜 CPU 가 미래를 계산하나 ──
 * 별의 궤적은 해석해다. 그래서 "0.55초 뒤 이 별이 어디 있는가" 를 지금 풀 수 있고,
 * 2차·3차 폭발도 **초기 조건 한 번 써넣는 것으로 끝난다.** 터지는 순간 CPU 는
 * 아무 일도 안 한다 — 파티클이 delay 로 알아서 태어난다.
 */

/**
 * 층마다 다른 것 — 별 개수 · 자식 수 · 자식이 터지는 시점 · 자식 크기 비율.
 *
 * `at` 이 클수록 자식이 부모 원의 **바깥쪽**에서 터진다.
 * 저항의 시간상수가 1/1.15 ≈ 0.87초라 0.85 는 부모 원이 62% 퍼진 지점이다 —
 * 연쇄가 원 한가운데서 겹쳐 뭉치지 않고 넓게 흩어지는 게 이 숫자 하나에 달려 있다.
 */
const BREAK_LAYERS = [
  { stars: 480, minChildren: 5, maxChildren: 8, at: 0.85, shrink: 0.62 },
  { stars: 130, minChildren: 2, maxChildren: 3, at: 0.7, shrink: 0.6 },
  { stars: 40, minChildren: 0, maxChildren: 0, at: 0, shrink: 0 },
] as const;

interface BreakInput {
  particles: ParticleSpec[];
  x: number;
  y: number;
  z: number;
  radius: number;
  delay: number;
  power: number;
  /** 이 폭발의 주 색. 한 폭발이 한 색이어야 "한 발"로 읽힌다. */
  tint: Color;
  /** 다섯에 하나꼴로 섞이는 색. 단색만 쓰면 평평해 보인다. */
  accent: Color;
  random: Random;
  depth: number;
}

function pushBreak(input: BreakInput): void {
  const { particles, x, y, z, radius, delay, power, tint, random } = input;
  const layer = BREAK_LAYERS[input.depth];
  if (!layer) return;

  const speed = radius * STAR_DRAG;

  /**
   * 껍데기 — **원**을 만드는 층.
   *
   * 속도를 넓게 뿌리면 별들이 구 안쪽에 흩어져 화면에서는 뿌연 얼룩이 된다.
   * 실제 폭죽이 동그란 건 별이 전부 **같은 속도**로 날아가 얇은 껍데기에 놓이기
   * 때문이다. 속도 폭을 10% 로 좁히는 것 하나가 "얼룩"과 "원"을 가른다.
   */
  const stars = Math.max(8, Math.round(layer.stars * power ** 1.35));
  for (let i = 0; i < stars; i += 1) {
    const [dx, dy, dz] = onSphere(random);
    const s = speed * (0.9 + random() * 0.1);
    particles.push({
      ox: x,
      oy: y,
      oz: z,
      vx: dx * s,
      vy: dy * s,
      vz: dz * s,
      drag: STAR_DRAG,
      gravity: STAR_GRAVITY,
      // 다 퍼질 때까지는 살아 있어야 한다. 시간상수(0.87초)의 네 배 이상.
      life: 3.9 + random() * 1.8,
      delay,
      // 작고 많이. 큰 점 몇 개는 물감이고, 작은 점 수천 개라야 불꽃이다.
      size: 0.1 + random() * 0.08,
      color: i % 5 === 0 ? input.accent : tint,
      shape: 2,
      seed: random(),
      floor: 0,
    });
  }

  const spread = layer.maxChildren - layer.minChildren + 1;
  const children = layer.minChildren + Math.floor(random() * spread);
  if (children <= 0) return;

  // 이 층의 원이 얼마나 퍼졌을 때 자식이 터지는가.
  const decay = (1 - Math.exp(-STAR_DRAG * layer.at)) / STAR_DRAG;
  const terminal = STAR_GRAVITY / STAR_DRAG;

  for (let c = 0; c < children; c += 1) {
    const [dx, dy, dz] = onSphere(random);
    // 아래로 처박히는 폭발은 물에 잠겨 안 보인다. 위쪽 반구로 밀어 올린다.
    const up = Math.abs(dy) * 0.7 + 0.15;
    pushBreak({
      particles,
      x: x + dx * speed * decay,
      y: y + (up * speed - terminal) * decay + terminal * layer.at,
      z: z + dz * speed * decay,
      radius: radius * layer.shrink,
      delay: delay + layer.at,
      power,
      tint: pick(FIREWORK_COLORS, random),
      accent: input.accent,
      random,
      depth: input.depth + 1,
    });
  }
}

/**
 * 폭죽 — 올라가는 껍질 하나, 정점에서 터지는 원, 그리고 그 원이 다시 터지는 연쇄.
 *
 * "터진다"는 인상은 **딜레이**가 만든다. 껍질이 올라가는 동안 불꽃 입자들은
 * 이미 버퍼에 들어가 있지만 아직 태어나지 않았다(delay). 그래서 CPU 는
 * 나중에 아무것도 안 하고도 정확히 그 시점에 폭발이 일어난다.
 * 연쇄도 같은 수법이다 — 2차 폭발의 자리는 1차 별의 궤적을 **미리 풀어서** 구한다.
 */
function fireworkBurst(
  x: number,
  z: number,
  random: Random,
  power: number,
): ParticleSpec[] {
  const particles: ParticleSpec[] = [];

  const speed = shellSpeedFor(power);
  const burstY =
    LAUNCH_Y + travel(speed, SHELL_GRAVITY, SHELL_DRAG, FUSE_SECONDS);

  /**
   * 껍질을 수직이 아니라 비스듬히 쏜다.
   *
   * 똑바로 올리면 매번 플레이어 머리 위 같은 자리에서 터져서, 하필 그 자리에 있는
   * 표지판과 겹쳤다. 방향을 매번 다르게 주면 겹칠 일이 줄고, 무엇보다 호를 그리며
   * 올라가는 게 실제 폭죽에 가깝다.
   */
  const driftAngle = random() * Math.PI * 2;
  const driftSpeed = 4 + random() * 2.4;
  const driftDistance = travel(driftSpeed, 0, SHELL_DRAG, FUSE_SECONDS);
  const burstX = x + Math.cos(driftAngle) * driftDistance;
  const burstZ = z + Math.sin(driftAngle) * driftDistance;

  // 올라가는 껍질. 꼬리처럼 보이도록 조금씩 늦게 태어나는 잔상을 붙인다.
  for (let i = 0; i < 14; i += 1) {
    particles.push({
      ox: x,
      oy: LAUNCH_Y,
      oz: z,
      vx: Math.cos(driftAngle) * driftSpeed,
      // ⚠ 높이 계산에 쓴 speed 와 **같은 값**이어야 한다. 여기가 어긋나면
      //   꼬리는 중간에서 끊기고 폭발은 엉뚱한 높이에서 일어난다.
      vy: speed,
      vz: Math.sin(driftAngle) * driftSpeed,
      drag: SHELL_DRAG,
      gravity: SHELL_GRAVITY,
      life: FUSE_SECONDS - i * 0.025,
      delay: i * 0.025,
      size: 0.32 - i * 0.016,
      color: new Color("#fff1c9"),
      shape: 2,
      seed: random(),
      floor: 0,
    });
  }

  // 색은 폭죽 하나당 둘로 묶는다. 무지개로 뿌리면 한 발로 안 읽힌다.
  const main = pick(FIREWORK_COLORS, random);
  const accent = pick(FIREWORK_COLORS, random);
  const radius = burstRadiusFor(power);

  // 여기서부터 1차 · 2차 · 3차가 재귀로 한꺼번에 만들어진다.
  pushBreak({
    particles,
    x: burstX,
    y: burstY,
    z: burstZ,
    radius,
    delay: FUSE_SECONDS,
    power,
    tint: main,
    accent,
    random,
    depth: 0,
  });

  /**
   * 안쪽 층. 더 느리고 더 오래 남아 아래로 흘러내린다 — 국화의 늘어진 꼬리다.
   * 이건 연쇄가 아니라 1차 폭발의 일부라 재귀 밖에 둔다.
   */
  const innerStars = Math.round(200 * power ** 1.2);
  const starSpeed = radius * STAR_DRAG;
  for (let i = 0; i < innerStars; i += 1) {
    const [dx, dy, dz] = onSphere(random);
    const s = starSpeed * (0.25 + random() * 0.4);
    particles.push({
      ox: burstX,
      oy: burstY,
      oz: burstZ,
      vx: dx * s,
      vy: dy * s,
      vz: dz * s,
      drag: 0.8,
      gravity: -3.2,
      life: 4.2 + random() * 1.8,
      delay: FUSE_SECONDS + 0.05,
      size: 0.07 + random() * 0.07,
      color: accent,
      shape: 2,
      seed: random(),
      floor: 0,
    });
  }

  return particles;
}

export function buildBurst(
  kind: ReactionKind,
  x: number,
  z: number,
  random: Random,
  /** 규모 배수. 1 이 사람이 누른 감정표현, 그 이상은 밤의 연출이다. */
  power = 1,
): ParticleSpec[] {
  const specs =
    kind === "heart"
      ? heartBurst(x, z, random)
      : kind === "confetti"
        ? confettiBurst(x, z, random, power)
        : fireworkBurst(x, z, random, power);

  /**
   * 바닥 높이를 여기서 한 번에 채운다.
   *
   * 각 버스트 함수가 따로 적으면 새 종류를 만들 때 빼먹기 딱 좋다 —
   * 그러면 그 종류만 땅을 뚫고 사라지는데, 원인을 찾기가 아주 성가시다.
   */
  const floor = elevationAt(x, z) + 0.03;
  for (const spec of specs) spec.floor = floor;
  return specs;
}

/** 폭죽이 터지는 높이. 카메라 프레임 안에 들어오는지 확인할 때 쓴다. */
export function fireworkBurstHeight(power = 1): number {
  return (
    LAUNCH_Y +
    travel(shellSpeedFor(power), SHELL_GRAVITY, SHELL_DRAG, FUSE_SECONDS)
  );
}
