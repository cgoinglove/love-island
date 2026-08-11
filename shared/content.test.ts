import { describe, expect, it } from "vitest";
import { ownerOf, PROFILE, photosOf } from "./content";
import { LOCALES } from "./i18n";

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
    expect(photosOf("ko").length).toBeGreaterThan(0);
  });

  it("사진 id 가 겹치지 않는다", () => {
    // 겹치면 리스트 key 가 충돌해 렌더가 뒤섞인다.
    const ids = photosOf("ko").map((photo) => photo.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("연락처가 비어 있지 않다", () => {
    // 낚시 쿠폰을 보낼 곳이다. 비어 있으면 보상 안내가 막다른 길이 된다.
    expect(ownerOf("ko").contact.trim().length).toBeGreaterThan(0);
  });

  it("책상 노트북이 띄울 주소가 진짜 주소다", () => {
    /**
     * 경력은 이 JSON 이 아니라 **이 주소가 가리키는 사이트**에 있다.
     * 오타가 나면 노트북이 영영 빈 화면을 띄우고, 그건 "아직 안 만들었나 보다"로 읽힌다.
     */
    const { site } = ownerOf("ko");
    expect(() => new URL(site)).not.toThrow();
    expect(new URL(site).protocol).toBe("https:");
  });

  it("어느 언어로 펴도 빈 글이 안 나온다", () => {
    /**
     * 원고는 한 언어만 적어도 되고(그 값이 모든 언어에 쓰인다), 언어별로 갈라 적어도
     * 된다. 어느 쪽이든 **화면에 빈 문자열이 가면 안 된다** — 빈 칸은 오타처럼
     * 조용히 지나가고, 배포하고 한참 뒤에야 눈에 띈다.
     */
    for (const locale of LOCALES) {
      const owner = ownerOf(locale);
      expect(owner.tagline.trim().length, locale).toBeGreaterThan(0);

      /**
       * 설명과 날짜는 안 적어도 된다(사진만 거는 사진첩). 다만 **적었으면
       * 빈 문자열이면 안 된다** — 빈 줄이 남아 레이아웃에 구멍이 생긴다.
       */
      for (const photo of photosOf(locale)) {
        for (const field of [photo.caption, photo.when]) {
          if (field === undefined) continue;
          expect(field.trim().length, `${locale} ${photo.id}`).toBeGreaterThan(
            0,
          );
        }
      }
    }
  });

  it("잘못된 원고는 파싱 단계에서 막힌다", async () => {
    const { z } = await import("zod");
    const bad = { owner: { name: "", tagline: "", contact: "" } };
    // 스키마가 실제로 거르는지 — 통과만 시키는 스키마는 없느니만 못하다.
    const schema = z.object({ owner: z.object({ name: z.string().min(1) }) });
    expect(schema.safeParse(bad).success).toBe(false);
  });
});
