import { describe, expect, it } from "vitest";
import { lookOf } from "./characterLook";

/** presence 가 만드는 것과 같은 모양의 id. */
function ids(count: number): string[] {
  return Array.from(
    { length: count },
    (_, i) => `p_${(i * 7919).toString(36)}xk`,
  );
}

describe("lookOf", () => {
  it("같은 id 는 언제나 같은 모습이다", () => {
    // 새로고침할 때마다 남이 다른 사람이 되면 누가 누군지 알 수 없다.
    expect(lookOf("p_abc123")).toEqual(lookOf("p_abc123"));
  });

  it("id 가 다르면 대체로 다르게 생긴다", () => {
    const looks = ids(40).map(lookOf);
    const shapes = new Set(
      looks.map((l) => `${l.earStyle}/${l.accessory}/${l.bodyColor}`),
    );
    // 40명이 모여도 겹치는 조합이 절반 미만이어야 "다양하다"고 할 수 있다.
    expect(shapes.size).toBeGreaterThan(20);
  });

  it("네 가지 귀가 모두 나온다", () => {
    // 한쪽으로 쏠리면 실질적으로 종류가 하나뿐인 것과 같다.
    const ears = new Set(ids(60).map((id) => lookOf(id).earStyle));
    expect(ears.size).toBe(4);
  });

  it("액세서리는 절반 넘게 없음이다", () => {
    // 다 쓰고 있으면 그게 특징이 안 된다.
    const looks = ids(200).map(lookOf);
    const bare = looks.filter((l) => l.accessory === "none").length;
    expect(bare / looks.length).toBeGreaterThan(0.4);
    expect(bare / looks.length).toBeLessThan(0.75);
  });

  it("팔 흔드는 속도가 사람마다 다르다", () => {
    // 다 같은 속도면 인형 여럿이 같은 태엽으로 도는 것처럼 보인다.
    const speeds = new Set(ids(40).map((id) => lookOf(id).armSpeed.toFixed(2)));
    expect(speeds.size).toBeGreaterThan(30);
    for (const id of ids(40)) {
      /**
       * 한 번 들었다 내리는 주기가 2π/속도 다. 가장 느린 캐릭터도 2.1초 안에
       * 한 번은 올려야 "움직이는 중"으로 보인다 — 1.2 였을 땐 5초가 걸렸다.
       */
      expect(lookOf(id).armSpeed).toBeGreaterThan(2.5);
      expect(lookOf(id).armSpeed).toBeLessThan(10);
    }
  });

  it("팔이 몸통보다 확실히 밝다", () => {
    // 머리색(6% 차이)을 쓰다가 팔이 몸에 묻혀 안 보였다.
    for (const id of ids(20)) {
      const look = lookOf(id);
      const value = (hex: string) => Number.parseInt(hex.slice(1), 16);
      expect(value(look.armColor)).toBeGreaterThan(value(look.headColor));
    }
  });

  it("머리는 몸보다 밝다", () => {
    // 같은 색이면 머리와 몸이 덩어리 하나로 뭉쳐 보인다.
    for (const id of ids(20)) {
      const look = lookOf(id);
      const value = (hex: string) => Number.parseInt(hex.slice(1), 16);
      expect(value(look.headColor)).toBeGreaterThan(value(look.bodyColor));
    }
  });

  it("크기가 상식적인 범위 안에 있다", () => {
    for (const id of ids(100)) {
      const look = lookOf(id);
      expect(look.headScale).toBeGreaterThan(0.8);
      expect(look.headScale).toBeLessThan(1.25);
      expect(look.bodyScale).toBeGreaterThan(0.8);
      expect(look.bodyScale).toBeLessThan(1.25);
      expect(look.bodyColor).toMatch(/^#[0-9a-f]{6}$/);
      expect(look.headColor).toMatch(/^#[0-9a-f]{6}$/);
    }
  });
});
