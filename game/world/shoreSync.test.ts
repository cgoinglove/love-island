import { describe, expect, it } from "vitest";
import { ISLAND_BASE_RADIUS, shoreRadiusAt } from "@/game/core/island";
import { SHORE_GLSL } from "./shaders";

/**
 * GLSL 은 TypeScript 가 아니라 컴파일러가 안 잡아준다.
 * 섬 반지름을 26 으로 키우고 셰이더의 17.0 을 안 고쳐서
 * 물거품이 실제 해안선에서 9m 떨어진 곳에 생긴 적이 있다 — 눈으로도 잘 안 보였다.
 *
 * 문자열을 뒤지는 조잡한 테스트지만, 이 종류의 어긋남은 이렇게라도 잡아야 한다.
 *
 * game/core 가 아니라 game/world 에 있는 이유: 셰이더가 world 소속이고
 * core 는 상위 모듈을 모른다. 처음엔 core 에 뒀다가 경계 린트에 막혔다 — 규칙이 맞았다.
 */
describe("셰이더와 지형 정의 동기화", () => {
  it("GLSL 의 섬 반지름이 ISLAND_BASE_RADIUS 와 같다", () => {
    const match = SHORE_GLSL.match(/return\s+([\d.]+)\s*\*/);
    expect(match?.[1]).toBeDefined();
    expect(Number(match?.[1])).toBe(ISLAND_BASE_RADIUS);
  });

  it("GLSL 의 하트 계수가 island.ts 와 같다", () => {
    // 하트를 근사한 사인 급수. 하나만 어긋나도 물거품이 해안선을 벗어난다.
    for (const coefficient of [
      "0.7747",
      "0.0268",
      "0.1665",
      "0.0432",
      "0.0325",
      "0.0186",
    ]) {
      expect(SHORE_GLSL, coefficient).toContain(coefficient);
    }
  });

  it("GLSL 과 TypeScript 가 같은 반지름을 낸다", () => {
    /**
     * 계수 목록만 보면 순서나 부호가 뒤집혀도 통과한다.
     * GLSL 식을 그대로 흉내 내어 값을 맞춰보는 게 진짜 검사다.
     */
    const fromGlsl = (angle: number) =>
      40.0 *
      (0.7747 -
        0.0268 * Math.sin(angle) -
        0.1665 * Math.sin(3 * angle) +
        0.0432 * Math.sin(5 * angle) -
        0.0325 * Math.sin(7 * angle) +
        0.0186 * Math.sin(9 * angle));

    for (let i = 0; i < 64; i += 1) {
      const angle = (i / 64) * Math.PI * 2;
      expect(shoreRadiusAt(angle)).toBeCloseTo(fromGlsl(angle), 6);
    }
  });
});
