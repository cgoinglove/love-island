import { describe, expect, it } from "vitest";
import { zoomOutForAspect } from "./framing";

/** 대표 화면들. 종횡비 = 가로 / 세로. */
const DESKTOP = 1920 / 1080; // 1.78
const LAPTOP = 1440 / 900; // 1.60
const TABLET_PORTRAIT = 820 / 1180; // 0.69
const PHONE_PORTRAIT = 390 / 844; // 0.46
const PHONE_LANDSCAPE = 844 / 390; // 2.16

describe("화면 모양에 따른 카메라 거리", () => {
  it("데스크톱에서는 손대지 않는다", () => {
    // 기준 화면에서 잘 맞춰둔 거리를 반응형이 흔들면 안 된다.
    expect(zoomOutForAspect(DESKTOP)).toBe(1);
    expect(zoomOutForAspect(LAPTOP)).toBe(1);
  });

  it("세로로 길수록 물러난다", () => {
    // fov 는 세로 화각이라, 화면이 세로로 길어지면 좁아지는 건 가로다.
    expect(zoomOutForAspect(TABLET_PORTRAIT)).toBeGreaterThan(1);
    expect(zoomOutForAspect(PHONE_PORTRAIT)).toBeGreaterThan(1);

    // 좁아질수록 단조증가한다. 상한에 닿은 뒤로는 같아도 된다.
    let previous = 0;
    for (let aspect = 2.4; aspect > 0.3; aspect -= 0.05) {
      const zoom = zoomOutForAspect(aspect);
      expect(zoom, `${aspect.toFixed(2)}`).toBeGreaterThanOrEqual(previous);
      previous = zoom;
    }

    // 살짝 좁은 창(1.2)은 상한에 안 닿아서 중간 어딘가에 있어야 한다.
    const narrowWindow = zoomOutForAspect(1.2);
    expect(narrowWindow).toBeGreaterThan(1);
    expect(narrowWindow).toBeLessThan(zoomOutForAspect(TABLET_PORTRAIT));
  });

  it("가로로 돌린 폰은 물러나지 않는다", () => {
    /**
     * "모바일이면 멀리" 로 잡으면 여기서 틀린다 — 가로 폰은 데스크톱보다 넓다.
     * 문제는 기기가 아니라 화면 모양이다.
     */
    expect(zoomOutForAspect(PHONE_LANDSCAPE)).toBe(1);
  });

  it("아무리 좁아도 한계가 있다", () => {
    /**
     * 가로 폭을 그대로 유지하려면 거리를 종횡비에 반비례시켜야 하는데
     * (24m → 93m) 그러면 캐릭터가 점이 된다. 절반쯤만 물러나고 만다.
     */
    for (const aspect of [0.46, 0.3, 0.1, 0.001]) {
      expect(zoomOutForAspect(aspect), `${aspect}`).toBeLessThanOrEqual(1.5);
    }
    expect(zoomOutForAspect(PHONE_PORTRAIT)).toBeLessThan(1.55);
  });

  it("첫 프레임의 0px 캔버스에도 안 터진다", () => {
    // 크기가 잡히기 전에 한 프레임이 도는 경우가 있다. NaN 이 카메라에 들어가면
    // 그 뒤로 화면이 통째로 검게 남는다.
    expect(zoomOutForAspect(0)).toBe(1);
    expect(zoomOutForAspect(Number.NaN)).toBe(1);
    expect(zoomOutForAspect(-3)).toBe(1);
  });
});
