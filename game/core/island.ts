import type { Vec2XZ } from "@/shared/types";

/**
 * 러브 아일랜드의 지형 정의. three 를 모르는 순수 함수 모음이다.
 *
 * 여기 있는 함수가 세 곳에서 같은 답을 내야 한다:
 *   1. Terrain 메시의 버텍스 높이
 *   2. 네비 그리드의 통행 가능 판정
 *   3. 바다 셰이더의 물거품(해안선) 위치  ← GLSL 로 이식되어 있다 (world/shaders.ts)
 * 셋이 어긋나면 물 위를 걷거나, 땅인데 못 가거나, 물거품이 엉뚱한 데 생긴다.
 */

/** 섬의 평균 반지름(m). */
export const ISLAND_BASE_RADIUS = 40;

/** 해수면. 이 높이 아래는 물에 잠긴다. */
export const SEA_LEVEL = 0;

/**
 * 이 높이 위부터 잔디, 아래는 모래.
 * 해변 컨셉이라 일부러 높게 잡았다 — 섬 가장자리가 넓게 모래로 남아야
 * "숲이 있는 산"이 아니라 "해변이 있는 섬"으로 읽힌다.
 */
export const GRASS_LEVEL = 0.72;

/**
 * 각도별 해안선까지의 거리.
 * 완벽한 원은 인공적으로 보인다. 하모닉 세 개를 겹쳐 만(灣)과 곶(串)을 만든다.
 * 계수를 바꾸면 섬 모양이 통째로 바뀌므로 world/shaders.ts 의 GLSL 도 같이 고쳐야 한다.
 */
/**
 * 해안선. **하트 모양**이다 — 러브 아일랜드니까.
 *
 * ── 왜 푸리에 급수인가 ──
 * 하트는 닫힌 극좌표 식이 지저분하고, 좌표표를 쓰면 GLSL 쪽에 그 표를 넘길 방법이
 * 마땅치 않다(물거품이 같은 해안선을 알아야 한다). 고전 하트 곡선을 극좌표로 바꿔
 * **사인 급수로 근사**하면 TS 와 GLSL 이 똑같은 식 한 줄을 공유할 수 있다.
 *
 * 좌우 대칭이라 코사인 항은 전부 0 에 가까워 버렸다. 홀수 항만 남는다.
 * 아래 꼭지는 급수라 살짝 둥글게 뭉개지는데, 뾰족하게 만들려고 항을 늘리면
 * 대신 물결(ringing)이 생긴다 — 9항이 그 균형점이다.
 *
 * ⚠ game/world/shaders.ts 의 SHORE_GLSL 에 같은 계수가 있다.
 *   한쪽만 고치면 물거품이 실제 해안선에서 어긋난다. shoreSync.test.ts 가 감시한다.
 */
export function shoreRadiusAt(angle: number): number {
  return (
    ISLAND_BASE_RADIUS *
    (0.7747 -
      0.0268 * Math.sin(angle) -
      0.1665 * Math.sin(3 * angle) +
      0.0432 * Math.sin(5 * angle) -
      0.0325 * Math.sin(7 * angle) +
      0.0186 * Math.sin(9 * angle))
  );
}

/** 해안선까지의 부호 있는 거리. 음수면 섬 안쪽, 양수면 바다. */
export function shoreDistance(x: number, z: number): number {
  return Math.hypot(x, z) - shoreRadiusAt(Math.atan2(z, x));
}

function smoothstep(edge0: number, edge1: number, value: number): number {
  const t = Math.min(Math.max((value - edge0) / (edge1 - edge0), 0), 1);
  return t * t * (3 - 2 * t);
}

/** 결정적인 언덕 노이즈. 라이브러리 없이 사인 세 겹으로 만든다 — 재현 가능해야 테스트가 된다. */
function hillNoise(x: number, z: number): number {
  return (
    Math.sin(x * 0.13 + 1.7) * Math.cos(z * 0.11 - 0.6) * 0.66 +
    Math.sin(x * 0.26 - 2.2) * Math.cos(z * 0.22 + 1.4) * 0.3 +
    Math.sin((x + z) * 0.07 + 0.4) * 0.24
  );
}

/**
 * 지형 높이.
 *  - 바다(해안선 밖): 완만하게 잠긴다
 *  - 해변: 0 ~ 0.42 (모래)
 *  - 안쪽: 언덕
 */
export function elevationAt(x: number, z: number): number {
  const distance = shoreDistance(x, z);
  const inland = -distance;

  if (distance > 0) {
    // 바다 쪽. 급격히 떨어지면 절벽처럼 보이니 완만하게.
    return -smoothstep(0, 8, distance) * 2.6;
  }

  const shelf = smoothstep(0, 3.4, inland) * 0.75;
  const hills = smoothstep(1.5, 11, inland) * hillNoise(x, z) * 1.15;

  /**
   * ⚠ 육지의 최저 높이는 **파도보다 높아야** 한다.
   *
   * 전에는 max(0, ...) 로 잘랐다. 그러면 언덕 잡음이 깊게 파인 자리가 정확히
   * 해수면 0 이 되는데, 바다 셰이더가 파도로 ±0.3m 를 흔드는 순간 그 위를 물이
   * 덮는다 — **육지 한복판에 물웅덩이가 생겼다.**
   *
   * shelf 는 물가에서 0, 안쪽에서 0.75 다. 그 비율로 바닥을 깔면 물가는 그대로
   * 0 까지 내려가 물과 만나고(해변), 안쪽은 최소 0.45m 라 파도가 못 넘는다.
   */
  const minimum = shelf * 0.6;
  return Math.max(minimum, shelf + hills);
}

/**
 * 걸을 수 있는 땅인가.
 * 물가에서 살짝 안쪽부터 허용한다 — 정확히 해수면에서 자르면
 * 캐릭터가 파도에 발을 담근 채 서 있게 된다.
 */
export function isLandAt(x: number, z: number): boolean {
  return elevationAt(x, z) > 0.1;
}

/** 스폰 지점. 섬 남쪽에서 북쪽(대륙 방향)을 보고 시작한다. */
/**
 * 스폰. 하트의 아래 꼭지에서 **안쪽으로** 들어온 자리다.
 *
 * 꼭지 끝(0, 30)에 세웠더니 화면 앞이 온통 모래밭이었다 — 하트의 꼭지는 길고
 * 좁은 모래톱이라 거기 서면 뒤쪽 절반이 빈 해변으로 채워진다.
 * 잔디가 시작되는 자리까지 들어와야 섬이 화면에 담긴다.
 */
export const SPAWN_POINT: Vec2XZ = [0, 21];

/**
 * 바다에 꽂힌 대형 배너. 섬 밖이라 통행 판정에는 안 들어간다.
 *
 * 한가운데(x=0)에 세웠더니 화면에서 방명록 게시판과 정확히 겹쳐 위아래로 포개졌다.
 * 둘 다 큰 사각 판이라 어느 쪽도 제대로 안 읽혔다. 옆으로 비켜 세우면
 * 배너는 배너대로 하늘에 뜨고 섬 가운데는 컨텐츠 자리로 남는다.
 */
export const SEA_BANNER: Vec2XZ = [-34, -46];

/**
 * 손으로 놓는 큰 오브젝트. 지금은 야자수 둘뿐이다.
 *
 * 한때 파라솔·선베드·비치볼도 있었지만 다 걷어냈다. 물건이 적을수록
 * 정작 봐야 할 것(게시판·책상·사진첩)이 눈에 들어온다.
 */
export interface Furniture {
  readonly kind: "palm";
  readonly x: number;
  readonly z: number;
  readonly rotation: number;
  readonly blockRadius: number;
}

/**
 * ⚠ 야자수는 **컨텐츠 앞(남쪽)에 서면 안 된다.**
 *
 * 카메라는 방위가 고정이라 늘 남쪽에서 북쪽을 본다. 그래서 어떤 물체든
 * 컨텐츠보다 z 가 큰 자리(= 남쪽)에 있으면 화면에서 그 앞을 가린다.
 * 스폰 좌우 (±13, 17) 에 "입구를 액자처럼" 잡으라고 두 그루를 세웠는데,
 * 하필 그 자리가 스폰에서 경력 책상·사진첩으로 가는 시선 위였다 —
 * 첫 화면에서 두 컨텐츠가 잎사귀에 통째로 가려졌다.
 *
 * island.test.ts 의 "시선을 막지 않는다" 가 이 규칙을 지킨다.
 */
export const FURNITURE: readonly Furniture[] = [
  // 두 봉우리 바깥쪽. 하트의 윤곽을 눈으로 짚어준다.
  { kind: "palm", x: -23, z: -19, rotation: 0.4, blockRadius: 0.75 },
  { kind: "palm", x: 23, z: -19, rotation: -1.1, blockRadius: 0.75 },
  // 양옆 허리. 컨텐츠보다 북쪽이라 시선을 안 막고, 화면 가장자리에서 액자 역할만 한다.
  { kind: "palm", x: -18, z: 6, rotation: 1.6, blockRadius: 0.75 },
  { kind: "palm", x: 18, z: 6, rotation: -1.9, blockRadius: 0.75 },
];

/**
 * 컨텐츠 오브젝트가 놓일 자리. 나무가 여기 자라면 안 된다.
 * feature 쪽 상수(features/&#42;/constants.ts)와 좌표가 같아야 한다.
 */
export const LANDMARKS: ReadonlyArray<
  readonly [x: number, z: number, radius: number, label: string]
> = [
  /**
   * 스폰에서 북쪽을 보면 셋이 한 화면에 들어온다. 걸어가서 찾을 필요가 없다.
   *
   * 스폰 반경이 유독 넓은(9m) 이유는 나무를 치우려는 게 아니라 **카메라 때문**이다.
   * 카메라는 캐릭터 남쪽 바다 위에 떠서 북쪽을 본다. 그 사이에 나무가 서 있으면
   * 첫 화면이 나뭇잎으로 가득 찬다.
   */
  [SPAWN_POINT[0], SPAWN_POINT[1], 9.0, "스폰"],
  [-14, 14, 4.4, "경력 책상"],
  [14, 14, 4.4, "사진첩"],
  [0, 6, 5.0, "방명록 게시판"],
  // 하트의 아래 꼭지. 사진첩이 동쪽 · 방명록이 북쪽이면 낚시터는 남쪽이다.
  [-5.8, 36.1, 4.0, "낚시터"],
];
