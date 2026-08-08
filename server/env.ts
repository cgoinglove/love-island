import "server-only";
import { z } from "zod";

/**
 * 환경변수는 Zod 를 거쳐야만 읽을 수 있다. process.env.FOO! 금지. (기획서 §7.5)
 *
 * 모듈 최상단에서 parse 하지 않고 지연 평가하는 이유:
 * Vercel 빌드 단계에는 런타임 환경변수가 없을 수 있는데, 최상단에서 던지면
 * 정적 페이지 생성이 통째로 실패한다. 실제로 DB 를 쓰는 순간에만 확인한다.
 */
const schema = z.object({
  DATABASE_URL: z.url({ protocol: /^postgres(ql)?$/ }),
  /** IP 해시에 섞는 값. 없으면 해시가 무지개 테이블에 그대로 노출된다. */
  IP_HASH_SALT: z.string().min(8).default("love-island-dev-salt"),
});

type Env = z.infer<typeof schema>;

let cached: Env | null = null;

export function getEnv(): Env {
  if (cached === null) {
    const parsed = schema.safeParse(process.env);
    if (!parsed.success) {
      throw new Error(
        `환경변수가 올바르지 않습니다:\n${parsed.error.issues
          .map((issue) => `  - ${issue.path.join(".")}: ${issue.message}`)
          .join("\n")}`,
      );
    }
    cached = parsed.data;
  }
  return cached;
}
