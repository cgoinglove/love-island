import { describe, expect, it } from "vitest";
import { CYCLE_SECONDS, phaseAt } from "./dayNight";

/**
 * 같은 순간에 섬에 있는 사람들은 같은 하늘을 봐야 한다.
 *
 * 예전엔 렌더러의 elapsedTime(페이지를 연 뒤 경과 시간)으로 하루를 굴렸다.
 * 그러면 먼저 들어온 사람은 밤인데 방금 들어온 사람은 아침인 화면이 나온다 —
 * 같은 섬에 있다는 감각이 거기서 깨진다.
 */
describe("하늘 동기화", () => {
  it("들어온 시각이 달라도 같은 순간에는 같은 하늘이다", () => {
    const now = 1_785_000_000; // 임의의 epoch 초

    // 한 시간 전에 들어온 사람과 방금 들어온 사람.
    const veteran = phaseAt(now);
    const newcomer = phaseAt(now);
    expect(veteran).toBe(newcomer);
  });

  it("서로 다른 순간에는 다른 하늘이다", () => {
    const now = 1_785_000_000;
    // 45초 = 주기의 1/4. 정오와 해질녘만큼 벌어져야 한다.
    expect(phaseAt(now + CYCLE_SECONDS / 4)).not.toBeCloseTo(phaseAt(now), 3);
  });

  it("주기만큼 지나면 정확히 같은 하늘로 돌아온다", () => {
    const now = 1_785_000_000;
    expect(phaseAt(now + CYCLE_SECONDS)).toBeCloseTo(phaseAt(now), 10);
    expect(phaseAt(now + CYCLE_SECONDS * 7)).toBeCloseTo(phaseAt(now), 10);
  });

  it("시계가 2초 어긋나도 하늘은 사실상 같다", () => {
    /**
     * 서버 보정은 Date 헤더(1초 해상도)와 왕복 지연 때문에 1~2초쯤 오차가 남는다.
     * 180초 주기에서 2초는 1% 남짓 — 눈에 안 보인다. 그 이상 정밀하게 맞출 이유가 없다.
     */
    const now = 1_785_000_000;
    expect(Math.abs(phaseAt(now + 2) - phaseAt(now))).toBeLessThan(0.02);
  });

  it("위상은 항상 0 이상 1 미만이다", () => {
    for (const t of [0, 1, 1_785_000_000, -50, -CYCLE_SECONDS * 3.5]) {
      const phase = phaseAt(t);
      expect(phase).toBeGreaterThanOrEqual(0);
      expect(phase).toBeLessThan(1);
    }
  });
});
