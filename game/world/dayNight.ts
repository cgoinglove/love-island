import { Color, Vector3 } from "three";

/**
 * 하루 순환.
 *
 * ── 왜 한 곳에서 계산하나 ──
 * 하늘 · 태양 · 달 · 별 · 방향광 · 바다색 · 안개가 전부 "지금 몇 시인가"에 반응해야 한다.
 * 각자 시계를 읽고 각자 색을 정하면 반드시 어긋난다 — 하늘은 이미 밤인데 바다만
 * 대낮이거나, 그림자 방향이 태양과 다른 식으로. 위상 하나를 여기서 풀고
 * 나머지는 그 결과를 **읽기만** 한다.
 *
 * ── 왜 리액트 상태가 아닌가 ──
 * 매 프레임 바뀌는 값이다. setState 로 돌리면 프레임마다 씬 전체가 리렌더된다.
 * 곡률 유니폼과 같은 방식으로, 살아 있는 객체 하나를 공유하고 제자리에서 고친다.
 */

/** 한 바퀴에 걸리는 시간(초). 낮 절반 · 밤 절반. */
export const CYCLE_SECONDS = 180;

/**
 * 화면에 보이는 천체가 도는 궤도(라디안).
 *
 * ⚠ 기준값이 **음수**인 건 실수가 아니다.
 *
 * 카메라는 19° 숙이고 세로 화각이 40° 다. 그래서 기하학적 지평선(고도 0°)은
 * 이미 화면 맨 윗줄에 있다. 화면에서 넓게 하늘로 보이는 띠는 사실 **지평선 아래**
 * 각도대다 — 곡률 셰이더가 먼바다를 아래로 접어서 그만큼 하늘이 드러난 것이다.
 *
 * 현실적인 고도(9°, 55°)로 올린 해가 전부 화면 위로 사라졌던 이유가 이것이다.
 * 보이는 하늘 띠 안에서 뜨고 지게 하려면 -15° 에서 떠서 -2° 까지 올라갔다 져야 한다.
 */
const HORIZON_ELEVATION = -0.27;
const ARC_RISE = 0.24;

/**
 * **그림자를 만드는** 광원의 최대 고도.
 *
 * 보이는 해와 같은 각도를 쓰면 빛이 지평선 아래에서 와서 지형이 밑에서 조명된다.
 * 눈에 보이는 해와 그림자를 만드는 빛을 갈라놓는 건 게임에서 흔한 타협이고,
 * 둘 다 만족시키려다 어느 쪽도 못 얻는 것보다 낫다.
 */
const LIGHT_MAX_ELEVATION = 0.95;

/**
 * 해가 뜨고 지는 방위(라디안, 북쪽 기준).
 *
 * 카메라는 북쪽을 보고 가로 화각이 약 ±30° 다. 정확히 동↔서(±90°)로 지나가면
 * 해는 하루의 대부분을 화면 밖에서 보낸다. 프레임 가장자리에서 뜨고 져서
 * 가운데를 지나가도록 ±35° 로 좁혔다 — 뜨고 지는 걸 **보이게** 하는 게
 * 천문학적 정확도보다 중요하다.
 */
const ARC_HALF_WIDTH = 0.62;

export interface SkyState {
  /** 0 = 해뜸, 0.25 = 정오, 0.5 = 해짐, 0.75 = 자정. */
  phase: number;
  /** 태양이 하늘에 있는 정도. 0 = 완전한 밤, 1 = 한낮. */
  daylight: number;
  /** 해뜰녘·해질녘의 세기. 0~1. 노을색과 긴 그림자를 만든다. */
  goldenHour: number;
  /** 별이 보이는 정도. 0~1. */
  starOpacity: number;

  /** 화면에 보이는 태양 방향(정규화). 지평선 아래로도 내려간다. */
  sunDirection: Vector3;
  /** 달 방향. 태양의 반대편. */
  moonDirection: Vector3;
  /**
   * 그림자를 만드는 빛의 방향. 보이는 해보다 훨씬 가파르다.
   * 밤에는 달 쪽에서 온다 — 해 방향을 그대로 쓰면 지형이 밑에서 조명된다.
   */
  lightDirection: Vector3;

  zenithColor: Color;
  horizonColor: Color;
  hazeColor: Color;

  /** 방향광 색과 세기. 밤에는 달빛이라 푸르고 약하다. */
  lightColor: Color;
  lightIntensity: number;
  ambientColor: Color;
  ambientIntensity: number;
  hemiSkyColor: Color;
  hemiGroundColor: Color;
  hemiIntensity: number;

  shallowWater: Color;
  deepWater: Color;
  fogColor: Color;
}

// ── 팔레트 ────────────────────────────────────────────
// 낮 · 노을 · 밤 세 벌을 섞는다. 중간색을 따로 정의하지 않고 보간에 맡기면
// 하루가 부드럽게 이어지고, 고칠 곳도 세 군데뿐이다.

const DAY = {
  zenith: new Color("#2166c2"),
  horizon: new Color("#95c7e6"),
  haze: new Color("#ffdcb0"),
  light: new Color("#fff0cc"),
  ambient: new Color("#fff3dc"),
  hemiSky: new Color("#c8e2ff"),
  hemiGround: new Color("#d8c088"),
  shallow: new Color("#79e0d2"),
  deep: new Color("#1b6a9e"),
  fog: new Color("#bfe0f2"),
};

const GOLDEN = {
  zenith: new Color("#3d6ba8"),
  horizon: new Color("#ffb27a"),
  haze: new Color("#ff9a5c"),
  light: new Color("#ffb877"),
  ambient: new Color("#ffd9b0"),
  hemiSky: new Color("#ffd0a8"),
  hemiGround: new Color("#c99a63"),
  shallow: new Color("#7fc9c4"),
  deep: new Color("#2a5f8f"),
  fog: new Color("#ffc39a"),
};

/**
 * 밤.
 *
 * 처음엔 훨씬 어둡게 잡았는데, 화면이 거의 안 보여서 "밤"이 아니라 "고장"으로 읽혔다.
 * 실제 밤보다 밝은 건 의도다 — 게임의 밤은 **달빛이 유난히 밝은 밤**이어야 한다.
 * 지형과 오브젝트가 실루엣으로라도 읽혀야 걸어다닐 수 있다.
 */
const NIGHT = {
  zenith: new Color("#12224a"),
  horizon: new Color("#31507f"),
  haze: new Color("#47618f"),
  light: new Color("#b9cdf2"),
  ambient: new Color("#7d90bd"),
  hemiSky: new Color("#4a6595"),
  hemiGround: new Color("#33405e"),
  shallow: new Color("#2f7f92"),
  deep: new Color("#12365e"),
  fog: new Color("#2a3c63"),
};

/** 살아 있는 상태. 씬 전체가 이 객체 하나를 공유한다. */
export const skyState: SkyState = {
  phase: 0,
  daylight: 1,
  goldenHour: 0,
  starOpacity: 0,
  sunDirection: new Vector3(0, 1, 0),
  moonDirection: new Vector3(0, -1, 0),
  lightDirection: new Vector3(0, 1, 0),
  zenithColor: DAY.zenith.clone(),
  horizonColor: DAY.horizon.clone(),
  hazeColor: DAY.haze.clone(),
  lightColor: DAY.light.clone(),
  lightIntensity: 2.2,
  ambientColor: DAY.ambient.clone(),
  ambientIntensity: 0.22,
  hemiSkyColor: DAY.hemiSky.clone(),
  hemiGroundColor: DAY.hemiGround.clone(),
  hemiIntensity: 1.05,
  shallowWater: DAY.shallow.clone(),
  deepWater: DAY.deep.clone(),
  fogColor: DAY.fog.clone(),
};

function clamp01(value: number): number {
  return value < 0 ? 0 : value > 1 ? 1 : value;
}

function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = clamp01((x - edge0) / (edge1 - edge0));
  return t * t * (3 - 2 * t);
}

/**
 * 위상에서 천체의 방향을 구한다.
 *
 * t 는 그 천체가 하늘에 있는 동안의 진행도(0 = 떠오름, 1 = 짐).
 * 음수·1 초과여도 그대로 계산한다 — 지평선 아래로 이어져야
 * 해가 지는 순간이 뚝 끊기지 않는다.
 */
function bodyDirection(
  t: number,
  base: number,
  rise: number,
  out: Vector3,
): Vector3 {
  const elevation = base + Math.sin(t * Math.PI) * rise;
  // 동쪽(+X)에서 떠서 북쪽(-Z)을 지나 서쪽(-X)으로 진다.
  const bearing = ARC_HALF_WIDTH - t * ARC_HALF_WIDTH * 2;
  const horizontal = Math.cos(elevation);
  return out
    .set(
      Math.sin(bearing) * horizontal,
      Math.sin(elevation),
      -Math.cos(bearing) * horizontal,
    )
    .normalize();
}

/** 세 팔레트를 낮/노을/밤 비율로 섞는다. */
function blend(
  out: Color,
  day: Color,
  golden: Color,
  night: Color,
  dayW: number,
  goldenW: number,
): Color {
  out.copy(night);
  out.lerp(day, dayW);
  out.lerp(golden, goldenW);
  return out;
}

/**
 * 위상을 구한다. 0 = 해뜸, 0.25 = 정오, 0.5 = 해짐, 0.75 = 자정.
 *
 * ⚠ **epoch 시각**을 넣는다. 페이지를 연 뒤 경과 시간을 쓰면 사람마다 하루가
 *   따로 흘러서, 한 사람은 한낮인데 옆 사람은 자정인 화면이 나온다.
 *   벽시계를 기준으로 삼으면 아무것도 주고받지 않아도 모두가 같은 시간대를 본다 —
 *   낮밤을 맞추자고 통신을 늘릴 이유가 없다.
 */
export function phaseAt(epochSeconds: number): number {
  // 음수 나머지가 나오지 않게 한 번 더 접는다. epoch 는 음수가 될 일이 없지만
  // 테스트에서 과거를 넣어볼 수 있고, 그때 하늘이 뒤집히면 안 된다.
  const raw = (epochSeconds / CYCLE_SECONDS) % 1;
  return raw < 0 ? raw + 1 : raw;
}

/**
 * epoch 시각(초)으로 하늘 상태를 갱신한다.
 *
 * 순수 함수가 아니라 공유 객체를 고치는 이유는 매 프레임 불리기 때문이다 —
 * 프레임마다 Color 열 몇 개를 새로 만들면 그게 곧 GC 부담이 된다.
 */
export function updateSky(epochSeconds: number, state: SkyState = skyState) {
  const phase = phaseAt(epochSeconds);
  state.phase = phase;

  // 낮 절반(0~0.5) 동안 해가 떠 있고, 나머지 절반은 달이 같은 궤적을 돈다.
  const sunT = phase * 2;
  const moonT = (phase - 0.5) * 2;
  bodyDirection(sunT, HORIZON_ELEVATION, ARC_RISE, state.sunDirection);
  bodyDirection(moonT, HORIZON_ELEVATION, ARC_RISE, state.moonDirection);

  /**
   * 밝기는 태양의 **정규화된** 고도로 정한다.
   *
   * 보이는 해의 y 를 그대로 쓰면 안 된다 — 궤도를 9° 로 낮춰놨으니 정오에도
   * y 가 0.16 밖에 안 되고, 그러면 하루 종일 어스름이 된다.
   * sin(πt) 는 궤도 높이와 무관하게 뜰 때 0, 정오 1, 질 때 0, 밤에 음수다.
   */
  const sunHeight = Math.sin(sunT * Math.PI);
  state.daylight = smoothstep(-0.12, 0.28, sunHeight);
  // 수평선 근처에서만 강해진다. 해가 높아지면 사라진다.
  state.goldenHour =
    smoothstep(-0.22, 0.02, sunHeight) *
    (1 - smoothstep(0.05, 0.34, sunHeight));
  state.starOpacity = 1 - smoothstep(-0.16, 0.06, sunHeight);

  // 그림자용 광원은 훨씬 가파른 궤도를 돈다. 밤에는 달 쪽으로 넘어간다.
  bodyDirection(
    sunHeight > 0 ? sunT : moonT,
    0,
    LIGHT_MAX_ELEVATION,
    state.lightDirection,
  );

  const d = state.daylight;
  const g = state.goldenHour;

  blend(state.zenithColor, DAY.zenith, GOLDEN.zenith, NIGHT.zenith, d, g);
  blend(state.horizonColor, DAY.horizon, GOLDEN.horizon, NIGHT.horizon, d, g);
  blend(state.hazeColor, DAY.haze, GOLDEN.haze, NIGHT.haze, d, g);
  blend(state.lightColor, DAY.light, GOLDEN.light, NIGHT.light, d, g);
  blend(state.ambientColor, DAY.ambient, GOLDEN.ambient, NIGHT.ambient, d, g);
  blend(state.hemiSkyColor, DAY.hemiSky, GOLDEN.hemiSky, NIGHT.hemiSky, d, g);
  blend(
    state.hemiGroundColor,
    DAY.hemiGround,
    GOLDEN.hemiGround,
    NIGHT.hemiGround,
    d,
    g,
  );
  blend(state.shallowWater, DAY.shallow, GOLDEN.shallow, NIGHT.shallow, d, g);
  blend(state.deepWater, DAY.deep, GOLDEN.deep, NIGHT.deep, d, g);
  blend(state.fogColor, DAY.fog, GOLDEN.fog, NIGHT.fog, d, g);

  /**
   * 밤에도 충분히 밝다. 달빛만으로 걸을 수 있어야 하고, 무엇보다
   * 아무것도 안 보이는 화면은 "밤"이 아니라 "고장"으로 읽힌다.
   * 처음 값(0.35 / 0.4)으로는 실제로 그렇게 보였다.
   */
  state.lightIntensity = 0.85 + d * 1.35;
  state.ambientIntensity = 0.52 - d * 0.3;
  state.hemiIntensity = 0.78 + d * 0.27;

  return state;
}
