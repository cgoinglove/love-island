import { z } from "zod";
import raw from "@/content/profile.json";

/**
 * 원고를 읽어 오는 유일한 자리.
 *
 * ── 왜 파일인가 ──
 * 경력과 사진은 거의 안 바뀌고, 바뀔 땐 본인이 바꾼다. 그런 원고에 DB 를 붙이면
 * 관리 화면 · 인증 · 마이그레이션이 따라오는데 정작 얻는 건 "커밋 없이 고칠 수 있다"뿐이다.
 * git 히스토리가 곧 변경 이력이 되는 게 이 규모에선 더 낫다.
 * (방명록은 반대다 — 남이 쓰고 자주 바뀌고 커밋할 수 없다. 그래서 그건 Postgres 에 있다.)
 *
 * ── 왜 검증하는가 ──
 * JSON 은 타입이 없다. 오타 하나가 빈 화면이나 undefined 로 조용히 새어 나가는데,
 * **원고는 조용히 틀리는 게 가장 나쁘다.** 여기서 한 번 파싱해 두면 잘못된 원고는
 * 빌드 때 터지고, 통과한 뒤로는 나머지 코드가 모양을 믿고 쓸 수 있다.
 */

const careerEntry = z.object({
  /** "2024 — 현재" 처럼 자유 형식. 정렬은 배열 순서를 따른다. */
  period: z.string().min(1),
  role: z.string().min(1),
  org: z.string().min(1),
  body: z.string().min(1),
  /** 화면에 태그로 붙는다. */
  stack: z.array(z.string().min(1)),
});

const photo = z.object({
  id: z.string().min(1),
  caption: z.string().min(1),
  /** "2024. 여름" 처럼 자유 형식. */
  when: z.string().min(1),
  /** public/ 기준 경로. 없으면 tint 색 카드로 대체된다. */
  src: z.string().startsWith("/").optional(),
  tint: z.string().regex(/^#[0-9a-fA-F]{6}$/, "tint 는 #rrggbb 여야 합니다"),
});

const profileSchema = z.object({
  // JSON 편집기 힌트용. 스키마 검증 대상은 아니다.
  $schema: z.string().optional(),
  owner: z.object({
    name: z.string().min(1),
    tagline: z.string().min(1),
    /** 낚시 쿠폰을 보낼 곳. 화면에 그대로 노출되므로 공개해도 되는 주소여야 한다. */
    contact: z.string().min(1),
  }),
  career: z.object({
    intro: z.string().min(1),
    entries: z.array(careerEntry).min(1),
  }),
  album: z.object({
    intro: z.string().min(1),
    photos: z.array(photo).min(1),
  }),
});

export type CareerEntry = z.infer<typeof careerEntry>;
export type Photo = z.infer<typeof photo>;
export type Profile = z.infer<typeof profileSchema>;

/**
 * 모듈 로드 시점에 한 번 검증한다.
 *
 * 실패하면 여기서 예외가 나고 빌드가 멈춘다 — 잘못된 원고가 배포되는 것보다
 * 배포가 안 되는 편이 낫다. 메시지에 어느 필드가 틀렸는지 그대로 나온다.
 */
function load(): Profile {
  const parsed = profileSchema.safeParse(raw);
  if (!parsed.success) {
    throw new Error(
      `content/profile.json 이 잘못됐습니다.\n${z.prettifyError(parsed.error)}`,
    );
  }
  return parsed.data;
}

export const PROFILE: Profile = load();

export const OWNER = PROFILE.owner;
export const CAREER_INTRO = PROFILE.career.intro;
export const CAREER_ENTRIES: readonly CareerEntry[] = PROFILE.career.entries;
export const ALBUM_INTRO = PROFILE.album.intro;
export const PHOTOS: readonly Photo[] = PROFILE.album.photos;
