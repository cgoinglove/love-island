import { z } from "zod";

/**
 * 언어.
 *
 * ── 왜 라이브러리를 안 쓰나 ──
 * next-intl 류는 라우팅 · 미들웨어 · 메시지 로더 · 플러럴 규칙을 한 벌로 들고 온다.
 * 여기 필요한 건 **문자열 두 벌과 URL 에서 언어 하나 읽기**뿐이다.
 * 한글 복수형도 없고(1명/2명이 같다), 번역가가 붙을 일도 없다.
 *
 * ── 왜 shared 인가 ──
 * 대사(봇) · 전리품 이름(낚시) · UI 문구가 전부 언어를 타는데, 그것들이 사는 층이
 * 제각각이다. 의존성 그래프의 잎에 두면 어디서든 부를 수 있다.
 */

export const LOCALES = ["ko", "en"] as const;
export type Locale = (typeof LOCALES)[number];

export const DEFAULT_LOCALE: Locale = "ko";

export function isLocale(value: unknown): value is Locale {
  return typeof value === "string" && LOCALES.includes(value as Locale);
}

/**
 * 아무 값에서나 언어를 뽑아낸다. 모르는 값이면 기본값이다.
 *
 * `?lang=` 는 배열로 올 수도 있다(`?lang=en&lang=ko`). 첫 번째만 본다 —
 * 사용자가 장난친 URL 때문에 500 이 나면 안 된다.
 */
export function resolveLocale(value: unknown): Locale {
  const first = Array.isArray(value) ? value[0] : value;
  return isLocale(first) ? first : DEFAULT_LOCALE;
}

/**
 * 원고에 쓰는 다국어 문자열.
 *
 * 한 언어만 적으면(그냥 문자열) 모든 언어가 그걸 쓴다. 그래서 `content/profile.json`
 * 을 지금 그대로 둬도 되고, 영어를 넣고 싶은 항목만 `{ "ko": "…", "en": "…" }` 로
 * 바꾸면 된다. **번역을 강요하지 않는 게 요점이다** — 원고는 주인장의 것이라
 * 없는 영어를 지어낼 수도 없고, 비어 있다고 화면이 깨져서도 안 된다.
 */
export const localizedText = z.union([
  z.string().min(1),
  z
    .object({
      ko: z.string().min(1).optional(),
      en: z.string().min(1).optional(),
    })
    .refine((value) => value.ko !== undefined || value.en !== undefined, {
      message: "적어도 한 언어는 있어야 합니다",
    }),
]);
export type LocalizedText = z.infer<typeof localizedText>;

/** 다국어 문자열에서 이 언어의 값을 고른다. 없으면 다른 언어라도 돌려준다. */
export function pick(text: LocalizedText, locale: Locale): string {
  if (typeof text === "string") return text;
  return text[locale] ?? text[DEFAULT_LOCALE] ?? text.en ?? "";
}
