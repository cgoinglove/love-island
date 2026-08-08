import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

/**
 * 테스트 대상은 three 도 DOM 도 모르는 순수 로직뿐이다 (기획서 §7.3).
 * jsdom 도 브라우저 러너도 필요 없고, 그래서 밀리초 단위로 돈다.
 * 3D 렌더링 결과는 테스트하지 않는다 — 손으로 논다.
 */
export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL(".", import.meta.url)),
    },
  },
  test: {
    environment: "node",
    include: ["{game,shared,features,server,content}/**/*.test.ts"],
  },
});
