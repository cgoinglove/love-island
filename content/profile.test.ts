import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { photosOf } from "@/shared/content";

/**
 * 원고와 **파일 시스템** 사이의 약속.
 *
 * shared/ 에 두지 않는 이유: 그쪽은 브라우저·워커·노드 어디서든 돌아야 해서
 * node:fs 를 못 쓴다(biome 경계 규칙이 막는다 — 실제로 막혔고, 규칙이 맞았다).
 * 파일이 있는지 보는 검사는 파일이 있는 이 폴더의 일이다.
 */
describe("content/ 와 public/ 의 약속", () => {
  it("사진 경로를 적었으면 실제 파일이 있다", () => {
    /**
     * 경로를 적어놓고 파일을 안 넣으면 화면에 깨진 이미지가 뜬다.
     * src 를 아예 안 적는 건 괜찮다 — 그건 tint 카드로 대체된다.
     */
    for (const photo of photosOf("ko")) {
      if (!photo.src) continue;
      expect(() => readFileSync(`public${photo.src}`), photo.src).not.toThrow();
    }
  });
});
