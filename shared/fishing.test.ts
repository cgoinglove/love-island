import { describe, expect, it } from "vitest";
import { CATCHABLES, catchableById, rollCatch, TOTAL_WEIGHT } from "./fishing";

/** 0~1 을 고르게 훑는다. 실제 분포를 근사하되 결과는 결정적이다. */
function sweep(samples: number): string[] {
  return Array.from(
    { length: samples },
    (_, i) => rollCatch(() => (i + 0.5) / samples).id,
  );
}

describe("전리품표", () => {
  it("id 가 겹치지 않는다", () => {
    // 겹치면 catchableById 가 엉뚱한 걸 돌려준다.
    const ids = CATCHABLES.map((item) => item.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("모든 항목이 뽑힐 수 있다", () => {
    // 무게 0 짜리가 섞이면 영영 안 나오는 항목이 생긴다.
    const seen = new Set(sweep(20000));
    for (const item of CATCHABLES) {
      expect(seen.has(item.id), item.id).toBe(true);
      expect(item.weight).toBeGreaterThan(0);
    }
  });

  it("꽝과 진짜, 두 가지뿐이다", () => {
    /**
     * 등급이 다섯 개였을 때 물고기와 배경화면은 받아도 아무 일도 안 일어나는
     * 물건이라 결국 "꽝인데 이름만 다른 것" 이었다. 이름을 늘리는 건 소음이다.
     * 걸린 게 하나뿐이라야 그 하나가 무엇인지 분명해진다.
     */
    expect(new Set(CATCHABLES.map((i) => i.tier))).toEqual(
      new Set(["junk", "real"]),
    );
  });

  it("거의 다 꽝이다", () => {
    /**
     * 후하면 커피를 못 사고, 무엇보다 **잘 안 나와야 재밌다.**
     * 확률을 만지다 실수로 후해지는 걸 여기서 잡는다.
     */
    const junk = CATCHABLES.filter((i) => i.tier === "junk");
    const share = junk.reduce((sum, i) => sum + i.weight, 0) / TOTAL_WEIGHT;
    expect(share).toBeGreaterThan(0.97);
  });

  it("진짜 보상은 2% 미만이다", () => {
    // 실제로 돈이 나가는 등급이다. 여기가 헐거워지면 주인장이 파산한다.
    const real = CATCHABLES.filter((i) => i.tier === "real");
    const share = real.reduce((sum, i) => sum + i.weight, 0) / TOTAL_WEIGHT;
    expect(share).toBeLessThan(0.02);
    expect(share).toBeGreaterThan(0.005);
  });

  it("진짜로 나가는 건 커피 하나뿐이다", () => {
    // 치킨·디저트까지 걸어뒀다가 뺐다. 거는 게 하나여야 얼마가 나갈지 계산이 된다.
    const real = CATCHABLES.filter((i) => i.tier === "real");
    expect(real).toHaveLength(1);
    expect(catchableById("americano")?.redeemable).toBe(true);
  });

  it("교환 코드는 진짜 보상에만 붙는다", () => {
    // 장화에 쿠폰 번호가 붙으면 그게 더 헷갈린다.
    for (const item of CATCHABLES) {
      expect(Boolean(item.redeemable), item.id).toBe(item.tier === "real");
    }
  });

  it("난수가 경계값이어도 항상 뭔가 나온다", () => {
    // 0 과 1 에서 undefined 가 새면 화면이 빈 채로 멈춘다.
    expect(rollCatch(() => 0).id).toBeTruthy();
    expect(rollCatch(() => 1).id).toBeTruthy();
    expect(rollCatch(() => 0.999999).id).toBeTruthy();
  });

  it("같은 난수면 같은 결과다", () => {
    // 서버가 굴리고 DB 에 남기는 값이다. 재현되지 않으면 검증할 수 없다.
    expect(rollCatch(() => 0.42)).toBe(rollCatch(() => 0.42));
  });
});
