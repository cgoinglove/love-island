import { describe, expect, it } from "vitest";
import {
  PRESENCE_ACTIVE_INTERVAL_MS,
  PRESENCE_HANDSHAKE_INTERVAL_MS,
  PRESENCE_IDLE_INTERVAL_MS,
} from "@/shared/presence";
import { type BeatRateInput, nextBeatDelay } from "./beatRate";

const base: BeatRateInput = {
  handshaking: false,
  pending: false,
  relaying: false,
};

describe("폴링 주기", () => {
  it("혼자면 느긋하게 돈다", () => {
    // 아무도 없으면 폴링이 하는 일은 "새 방문자 발견" 뿐이다.
    expect(nextBeatDelay(base)).toBe(PRESENCE_IDLE_INTERVAL_MS);
  });

  it("전부 P2P 로 붙었으면 느긋하게 돈다", () => {
    // 좌표는 이미 브라우저끼리 직접 간다. 여기가 WebRTC 를 붙인 값어치다.
    expect(nextBeatDelay({ ...base, relaying: false })).toBe(
      PRESENCE_IDLE_INTERVAL_MS,
    );
  });

  it("폴링이 남의 좌표를 나르는 중이면 빠르게 돈다", () => {
    /**
     * ⚠ 여기가 배포 환경이 느렸던 자리다.
     *
     * 예전 규칙은 `내가 안 움직이면 3초` 가 맨 앞이었다. 내 좌표만 생각하면 맞는
     * 말이지만 **폴링은 양방향**이다 — 내가 올리는 통로가 곧 남의 좌표를 받는 통로다.
     * 그래서 가만히 서서 남이 걸어다니는 걸 보면 3초에 한 번씩만 갱신됐다.
     */
    expect(nextBeatDelay({ ...base, relaying: true })).toBe(
      PRESENCE_ACTIVE_INTERVAL_MS,
    );
  });

  it("내 움직임은 주기를 안 정한다", () => {
    /**
     * 입력에 "내가 움직였나" 가 아예 없다는 게 이 함수의 요점이다.
     * 판단 기준은 **이 폴링이 지금 무슨 일을 하고 있는가** 다.
     */
    const keys = Object.keys(base).sort();
    expect(keys).toEqual(["handshaking", "pending", "relaying"]);
  });

  it("악수 중에는 무엇보다 빠르다", () => {
    /**
     * offer → answer → ICE 후보가 전부 이 폴링에 실려 다닌다.
     * 왕복 한 번이 곧 연결이 붙기까지의 시간이라, 여기가 느리면 P2P 가
     * 성사되기 전에 사람이 나간다 — 그리고 영영 폴백으로 논다.
     */
    expect(nextBeatDelay({ ...base, handshaking: true })).toBe(
      PRESENCE_HANDSHAKE_INTERVAL_MS,
    );
    expect(nextBeatDelay({ ...base, pending: true })).toBe(
      PRESENCE_HANDSHAKE_INTERVAL_MS,
    );
    // 좌표를 나르는 중이어도 악수가 먼저다.
    expect(
      nextBeatDelay({ handshaking: true, pending: true, relaying: true }),
    ).toBe(PRESENCE_HANDSHAKE_INTERVAL_MS);
  });

  it("빠를수록 앞에 온다", () => {
    // 순서가 뒤집히면 조용히 느려진다. 눈으로는 안 보이는 종류의 버그다.
    expect(PRESENCE_HANDSHAKE_INTERVAL_MS).toBeLessThan(
      PRESENCE_ACTIVE_INTERVAL_MS,
    );
    expect(PRESENCE_ACTIVE_INTERVAL_MS).toBeLessThan(PRESENCE_IDLE_INTERVAL_MS);
  });

  it("폴링 주기가 보간 지연보다 촘촘하다", async () => {
    /**
     * 보간은 "두 스냅샷 **사이**"를 채우는 장치다. 스냅샷이 지연보다 뜸하게 오면
     * 채울 사이가 없어서 마지막 위치에 얼어붙었다가 툭 튄다.
     * 3초 주기 × 320ms 지연이 정확히 그 상태였다.
     */
    const { PRESENCE_INTERP_DELAY_MS } = await import("@/shared/presence");
    expect(PRESENCE_ACTIVE_INTERVAL_MS).toBeLessThan(PRESENCE_INTERP_DELAY_MS);
  });
});
