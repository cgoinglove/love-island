import { afterEach, describe, expect, it, vi } from "vitest";
import {
  clockOffsetMs,
  noteServerTime,
  resetServerClock,
  serverNow,
} from "./serverClock";

afterEach(() => {
  resetServerClock();
  vi.useRealTimers();
});

/** 로컬 시계를 특정 시각으로 고정한다. */
function freezeLocalClock(iso: string) {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(iso));
}

describe("serverClock", () => {
  it("보정 전에는 로컬 시계를 그대로 쓴다", () => {
    freezeLocalClock("2026-08-07T12:00:00Z");
    expect(serverNow()).toBe(Date.now());
    expect(clockOffsetMs()).toBe(0);
  });

  it("시계가 크게 틀어진 기기를 서버 시각으로 끌어온다", () => {
    // 로컬이 5분 빠른 기기. 혼자 다른 시간대의 하늘을 보게 된다.
    freezeLocalClock("2026-08-07T12:05:00Z");
    noteServerTime("Fri, 07 Aug 2026 12:00:00 GMT");

    expect(clockOffsetMs()).toBeCloseTo(-300_000, -3);
    expect(serverNow()).toBeCloseTo(Date.parse("2026-08-07T12:00:00Z"), -3);
  });

  it("작은 차이는 무시한다", () => {
    /**
     * Date 헤더는 1초 단위고 왕복 지연도 안 빼준다. 그 잡음을 매번 따라가면
     * 보정값이 끊임없이 흔들려 하늘이 미세하게 떨린다.
     */
    freezeLocalClock("2026-08-07T12:00:01Z");
    noteServerTime("Fri, 07 Aug 2026 12:00:00 GMT");
    expect(clockOffsetMs()).toBe(0);
  });

  it("헤더가 없거나 이상하면 아무것도 안 한다", () => {
    // 보정을 못 하는 것보다 엉뚱한 값으로 보정하는 게 나쁘다.
    freezeLocalClock("2026-08-07T12:00:00Z");
    noteServerTime(null);
    noteServerTime("이게 무슨 날짜야");
    noteServerTime("");
    expect(clockOffsetMs()).toBe(0);
  });
});
