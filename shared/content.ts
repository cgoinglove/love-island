import { z } from "zod";
import raw from "@/content/profile.json";
import { type Locale, type LocalizedText, localizedText, pick } from "./i18n";

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

/**
 * 글이 들어가는 자리는 전부 다국어를 받는다.
 *
 * 그냥 문자열로 두면 그 값이 모든 언어에 쓰이고, `{ "ko": "…", "en": "…" }` 로
 * 적으면 언어별로 갈린다. **번역을 강요하지 않는 게 요점이다** — 원고는 주인장의
 * 것이라 없는 영어를 지어낼 수 없고, 안 적었다고 화면이 깨져서도 안 된다.
 */
const photo = z.object({
  id: z.string().min(1),
  /**
   * 설명과 날짜는 **선택**이다.
   *
   * 사진첩에 사진만 걸고 싶을 때가 있다 — 억지로 한 줄씩 붙이면 그게 더 군더더기다.
   * 안 적으면 화면에서 그 줄이 통째로 빠진다(빈 줄이 남지 않는다).
   */
  caption: localizedText.optional(),
  /** "2024. 여름" 처럼 자유 형식. */
  when: localizedText.optional(),
  /** public/ 기준 경로. 없으면 tint 색 카드로 대체된다. */
  src: z.string().startsWith("/").optional(),
  tint: z.string().regex(/^#[0-9a-fA-F]{6}$/, "tint 는 #rrggbb 여야 합니다"),
});

const profileSchema = z.object({
  // JSON 편집기 힌트용. 스키마 검증 대상은 아니다.
  $schema: z.string().optional(),
  owner: z.object({
    name: z.string().min(1),
    tagline: localizedText,
    /** 낚시 쿠폰을 보낼 곳. 화면에 그대로 노출되므로 공개해도 되는 주소여야 한다. */
    contact: z.string().min(1),
    /**
     * 책상 노트북이 띄우는 주소.
     *
     * 경력을 이 JSON 에 다시 적지 않는다 — 이미 제대로 만들어 둔 포트폴리오가
     * 있는데 여기 베껴 두면 **두 곳이 서로 어긋나기 시작한다.** 노트북은 그걸
     * 그대로 띄운다. 원본이 바뀌면 이 섬도 같이 바뀐다.
     */
    site: z.url(),
  }),
  album: z.object({
    intro: localizedText,
    photos: z.array(photo).min(1),
  }),
});

type RawPhoto = z.infer<typeof photo>;
export type Profile = z.infer<typeof profileSchema>;

export interface Photo {
  id: string;
  caption?: string;
  when?: string;
  src?: string;
  tint: string;
}

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

/**
 * 언어 하나를 골라 원고를 편다.
 *
 * ⚠ 상수가 아니라 **함수**다. 모듈 상수로 두면 import 시점에 언어가 굳는데,
 *   그때는 아직 언어가 안 정해져 있다(shared/strings.ts 의 setLocale 참고).
 */
function photoOf(raw: RawPhoto, locale: Locale): Photo {
  return {
    id: raw.id,
    // 안 적은 항목은 키 자체를 안 넣는다 — 빈 문자열을 넣으면 화면에 빈 줄이 남는다.
    ...(raw.caption === undefined
      ? {}
      : { caption: pick(raw.caption, locale) }),
    ...(raw.when === undefined ? {} : { when: pick(raw.when, locale) }),
    ...(raw.src === undefined ? {} : { src: raw.src }),
    tint: raw.tint,
  };
}

export function ownerOf(locale: Locale) {
  return {
    name: PROFILE.owner.name,
    tagline: pick(PROFILE.owner.tagline, locale),
    contact: PROFILE.owner.contact,
    site: PROFILE.owner.site,
  };
}

export function albumIntroOf(locale: Locale): string {
  return pick(PROFILE.album.intro, locale);
}

export function photosOf(locale: Locale): readonly Photo[] {
  return PROFILE.album.photos.map((raw) => photoOf(raw, locale));
}

/** 이 값만 언어를 안 탄다 — 이메일 주소는 번역할 게 없다. */
export const OWNER_CONTACT = PROFILE.owner.contact;

/**
 * 3D 빨랫줄에 걸리는 색 카드.
 *
 * 글이 없어서 언어를 안 탄다 — 그래서 모듈 상수로 둘 수 있다.
 * (문구가 있는 것들은 전부 함수다. 언어가 정해지기 전에 굳으면 안 되니까.)
 */
export const PHOTO_SWATCHES: readonly { id: string; tint: string }[] =
  PROFILE.album.photos.map((photo) => ({ id: photo.id, tint: photo.tint }));

export type { LocalizedText };
