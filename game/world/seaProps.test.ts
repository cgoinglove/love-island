import { describe, expect, it } from "vitest";
import {
  BEAM_LENGTH,
  BEAM_PITCH,
  beamReach,
  buildBoat,
  buildBoatBeam,
  buildFish,
  buildLightPool,
  buildSchool,
  buildSharkBody,
  LAMP_Y,
} from "./seaProps";

/**
 * 모양은 눈으로 봐야 알지만, **눈으로 봐도 모르는 것**이 몇 개 있다.
 * 여기서 지키는 건 그것들이다.
 */

describe("뱃등 빛줄기", () => {
  it("물에 닿기 전에 끊기지 않는다", () => {
    /**
     * 높이 · 숙인 각 · 길이 셋이 같이 움직인다. 각을 조금 세우면 닿는 거리가
     * 확 멀어지는데, 그때 길이를 안 늘리면 빛줄기가 **허공에서 끝난다** —
     * 등대가 아니라 공중에 뜬 고깔이 된다. 눈으로는 밤에만, 그것도 배가
     * 화면에 있을 때만 보이므로 놓치기 쉽다.
     */
    const distance = Math.hypot(beamReach(), LAMP_Y);
    expect(BEAM_LENGTH).toBeGreaterThan(distance);
  });

  it("꼭짓점이 등에 붙고 -Z 로 뻗는다", () => {
    /**
     * 셰이더가 `-position.z / 길이` 로 감쇠를 계산한다(BEAM_VERTEX).
     * 원뿔을 옮기거나 눕히는 순서를 잘못 넣으면 그 식이 통째로 어긋나서,
     * 빛이 뿌리에서 사라지고 끝에서 진해진다.
     */
    const position = buildBoatBeam().attributes.position;
    let nearest = Number.POSITIVE_INFINITY;
    let farthest = Number.POSITIVE_INFINITY;
    for (let i = 0; i < (position?.count ?? 0); i += 1) {
      const z = position?.getZ(i) ?? 0;
      nearest = Math.min(nearest, Math.abs(z));
      farthest = Math.min(farthest, z);
    }
    expect(nearest).toBeLessThan(0.001);
    expect(farthest).toBeCloseTo(-BEAM_LENGTH, 3);
  });

  it("빛 웅덩이는 진행 방향으로 늘어난다", () => {
    /**
     * 빛이 비스듬히 떨어지니 물 위 자국은 원이 아니라 타원이다.
     * 늘어나는 비율은 취향이 아니라 1/sin(숙인 각) 이다.
     */
    const position = buildLightPool().attributes.position;
    let halfWidth = 0;
    let halfLength = 0;
    for (let i = 0; i < (position?.count ?? 0); i += 1) {
      halfWidth = Math.max(halfWidth, Math.abs(position?.getX(i) ?? 0));
      halfLength = Math.max(halfLength, Math.abs(position?.getZ(i) ?? 0));
    }
    expect(halfLength / halfWidth).toBeCloseTo(1 / Math.sin(BEAM_PITCH), 2);
  });
});

describe("바다 모형", () => {
  it("한 덩어리로 구워진다", () => {
    /**
     * 조각이 마흔 개든 병합해서 메시 하나가 되어야 한다. 병합이 실패하면
     * mergeColored 가 던지므로, 만들어지기만 하면 통과다 —
     * 실제로 인덱스 유무가 섞여 봇이 통째로 안 그려진 적이 있다.
     */
    for (const build of [
      buildBoat,
      buildSharkBody,
      buildFish,
      buildSchool,
    ] as const) {
      const geometry = build();
      expect(geometry.attributes.position?.count ?? 0).toBeGreaterThan(0);
      expect(geometry.attributes.color?.itemSize).toBe(3);
    }
  });

  it("배는 물에 잠긴 부분이 있다", () => {
    // 투명한 물 아래로 선체가 보인다. 수면 위에만 있으면 물에 뜬 게 아니라 떠 있는 것이다.
    const position = buildBoat().attributes.position;
    let lowest = 0;
    for (let i = 0; i < (position?.count ?? 0); i += 1) {
      lowest = Math.min(lowest, position?.getY(i) ?? 0);
    }
    expect(lowest).toBeLessThan(-0.5);
  });
});
