import { describe, expect, it } from "vitest";
import { CYCLE_SECONDS, type SkyState, skyState, updateSky } from "./dayNight";

/** 공유 객체를 건드리지 않도록 매번 새 상태에 쓴다. */
function at(seconds: number): SkyState {
  const fresh = structuredClone({
    ...skyState,
    sunDirection: skyState.sunDirection.clone(),
    moonDirection: skyState.moonDirection.clone(),
    lightDirection: skyState.lightDirection.clone(),
  }) as SkyState;
  // structuredClone 은 Vector3/Color 의 메서드를 잃는다. 원본을 복제해 끼워 넣는다.
  fresh.sunDirection = skyState.sunDirection.clone();
  fresh.moonDirection = skyState.moonDirection.clone();
  fresh.lightDirection = skyState.lightDirection.clone();
  for (const key of [
    "zenithColor",
    "horizonColor",
    "hazeColor",
    "lightColor",
    "ambientColor",
    "hemiSkyColor",
    "hemiGroundColor",
    "shallowWater",
    "deepWater",
    "fogColor",
  ] as const) {
    fresh[key] = skyState[key].clone();
  }
  return updateSky(seconds, fresh);
}

const NOON = CYCLE_SECONDS * 0.25;
const MIDNIGHT = CYCLE_SECONDS * 0.75;
const SUNSET = CYCLE_SECONDS * 0.5;

describe("하루 순환", () => {
  it("정오에 해가 가장 높고 자정엔 훨씬 아래다", () => {
    // 궤도 전체가 기하학적 지평선 아래에 있다 — 화면에서 하늘로 보이는 띠가 거기다.
    expect(at(NOON).sunDirection.y).toBeGreaterThan(
      at(MIDNIGHT).sunDirection.y,
    );
    expect(at(NOON).sunDirection.y).toBeGreaterThan(-0.1);
    expect(at(MIDNIGHT).sunDirection.y).toBeLessThan(-0.4);
  });

  it("보이는 해는 카메라 프레임 안에 머문다", () => {
    /**
     * 카메라가 19° 숙이고 세로 화각이 40° 라, 기하학적 지평선(0°)이 이미 화면
     * 맨 윗줄이다. 화면에서 하늘로 보이는 띠는 곡률로 접힌 먼바다 위쪽,
     * 즉 **지평선 아래** 각도대다. 현실적인 고도로 올리면 해가 하루 종일
     * 화면 위에 있고, 그게 정확히 "태양이 없다" 로 보였다.
     */
    const elevations = Array.from({ length: 40 }, (_, i) =>
      Math.asin(at((CYCLE_SECONDS * i) / 80).sunDirection.y),
    );
    const highest = Math.max(...elevations);

    // 보이는 하늘 띠는 대략 -17° ~ 0°. 정오의 해가 그 안에 있어야 한다.
    expect(highest).toBeLessThan(0.02);
    expect(highest).toBeGreaterThan(-0.12);
  });

  it("그림자를 만드는 빛은 보이는 해보다 훨씬 가파르다", () => {
    // 9° 광원으로 그림자를 만들면 키의 6배까지 늘어져 물체에서 떨어져 나간다.
    const noon = at(NOON);
    expect(noon.lightDirection.y).toBeGreaterThan(0.7);
    expect(noon.sunDirection.y).toBeLessThan(0.05);
  });

  it("밤에는 빛이 달 쪽에서 온다", () => {
    // 해 방향을 그대로 쓰면 지평선 아래에서 지형을 비춰 그림자가 거꾸로 진다.
    const night = at(MIDNIGHT);
    expect(night.lightDirection.y).toBeGreaterThan(0);
    expect(night.sunDirection.y).toBeLessThan(0);
  });

  it("해가 지면 달이 뜬다", () => {
    // 밤에 하늘이 통째로 비어 있으면 "밤"이 아니라 "아무것도 없음"이다.
    const night = at(MIDNIGHT);
    expect(night.moonDirection.y).toBeGreaterThan(-0.1);
    const day = at(NOON);
    expect(day.moonDirection.y).toBeLessThan(night.moonDirection.y);
  });

  it("해는 동쪽에서 떠서 서쪽으로 진다", () => {
    // +X 가 동쪽. 뜰 때는 동쪽, 질 때는 서쪽에 있어야 한다.
    expect(at(CYCLE_SECONDS * 0.02).sunDirection.x).toBeGreaterThan(0.2);
    expect(at(CYCLE_SECONDS * 0.48).sunDirection.x).toBeLessThan(-0.2);
  });

  it("한낮은 밝고 한밤은 어둡다", () => {
    expect(at(NOON).daylight).toBeCloseTo(1, 2);
    expect(at(MIDNIGHT).daylight).toBeCloseTo(0, 2);
    // 밤을 밝혔으므로 배수는 줄었다. 그래도 낮이 확연히 밝아야 한다.
    expect(at(NOON).lightIntensity).toBeGreaterThan(
      at(MIDNIGHT).lightIntensity * 2,
    );
  });

  it("밤에도 걸어다닐 만큼은 밝다", () => {
    /**
     * 아무것도 안 보이는 화면은 밤이 아니라 고장으로 읽힌다.
     * 처음 값(0.35 / 0.4)으로는 실제로 그렇게 보여서 올렸다 —
     * 게임의 밤은 달빛이 유난히 밝은 밤이어야 한다.
     */
    const night = at(MIDNIGHT);
    expect(night.lightIntensity).toBeGreaterThan(0.7);
    expect(night.ambientIntensity).toBeGreaterThan(0.45);
    expect(night.hemiIntensity).toBeGreaterThan(0.7);
  });

  it("별은 밤에만 보인다", () => {
    expect(at(MIDNIGHT).starOpacity).toBeGreaterThan(0.9);
    expect(at(NOON).starOpacity).toBeCloseTo(0, 3);
  });

  it("노을은 해질녘에만 강하다", () => {
    // 정오에도 주황색이면 하루 종일 노을이라 시간이 흐르는 느낌이 안 난다.
    expect(at(SUNSET).goldenHour).toBeGreaterThan(0.5);
    expect(at(NOON).goldenHour).toBeLessThan(0.05);
  });

  it("바다는 하늘과 같이 어두워진다", () => {
    // 하늘만 밤이고 물만 대낮이면 그 순간 세계가 갈라진다.
    const lum = (c: { r: number; g: number; b: number }) => c.r + c.g + c.b;
    expect(lum(at(MIDNIGHT).deepWater)).toBeLessThan(lum(at(NOON).deepWater));
    expect(lum(at(MIDNIGHT).zenithColor)).toBeLessThan(
      lum(at(NOON).zenithColor),
    );
  });

  it("한 바퀴 돌면 제자리로 온다", () => {
    // 이어 붙는 지점에서 색이나 방향이 튀면 3분마다 화면이 깜빡인다.
    const start = at(0.0001);
    const end = at(CYCLE_SECONDS - 0.0001);
    expect(end.sunDirection.y).toBeCloseTo(start.sunDirection.y, 2);
    expect(end.daylight).toBeCloseTo(start.daylight, 2);
  });

  it("방향 벡터는 항상 단위벡터다", () => {
    for (let i = 0; i < 24; i += 1) {
      const s = at((CYCLE_SECONDS * i) / 24);
      expect(s.sunDirection.length()).toBeCloseTo(1, 5);
      expect(s.moonDirection.length()).toBeCloseTo(1, 5);
      expect(s.lightDirection.length()).toBeCloseTo(1, 5);
    }
  });
});
