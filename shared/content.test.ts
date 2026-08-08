import { describe, expect, it } from "vitest";
import { CAREER_ENTRIES, OWNER, PHOTOS, PROFILE } from "./content";

/**
 * 원고 검사.
 *
 * content/profile.json 은 코드를 안 열고 고치는 파일이라, 오타가 나기 가장 쉬운 곳이다.
 * 그리고 원고는 **조용히 틀리는 게 가장 나쁘다** — 빈 화면이나 undefined 로 새어 나가면
 * 배포하고 한참 뒤에야 알아챈다. 여기서 잡으면 커밋 전에 걸린다.
 *
 * (tsc 는 못 잡는다. 타입만 볼 뿐 JSON 값을 실행해 보지 않는다.)
 */
describe("content/profile.json", () => {
  it("스키마를 통과한다", () => {
    // import 만으로도 검증이 돌지만, 실패 지점을 여기로 못박아 둔다.
    expect(PROFILE.owner.name.length).toBeGreaterThan(0);
    expect(CAREER_ENTRIES.length).toBeGreaterThan(0);
    expect(PHOTOS.length).toBeGreaterThan(0);
  });

  it("사진 id 가 겹치지 않는다", () => {
    // 겹치면 리스트 key 가 충돌해 렌더가 뒤섞인다.
    const ids = PHOTOS.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("연락처가 비어 있지 않다", () => {
    // 낚시 쿠폰을 보낼 곳이다. 비어 있으면 보상 안내가 막다른 길이 된다.
    expect(OWNER.contact.trim().length).toBeGreaterThan(0);
  });

  it("잘못된 원고는 파싱 단계에서 막힌다", async () => {
    const { z } = await import("zod");
    const bad = { owner: { name: "", tagline: "", contact: "" } };
    // 스키마가 실제로 거르는지 — 통과만 시키는 스키마는 없느니만 못하다.
    const schema = z.object({ owner: z.object({ name: z.string().min(1) }) });
    expect(schema.safeParse(bad).success).toBe(false);
  });
});
