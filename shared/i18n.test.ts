import { describe, expect, it } from "vitest";
import {
  DEFAULT_LOCALE,
  isLocale,
  LOCALES,
  type LocalizedText,
  pick,
  resolveLocale,
} from "./i18n";
import { stringsFor } from "./strings";

describe("언어 고르기", () => {
  it("아는 언어만 받는다", () => {
    expect(resolveLocale("en")).toBe("en");
    expect(resolveLocale("ko")).toBe("ko");
    expect(isLocale("en")).toBe(true);
    expect(isLocale("fr")).toBe(false);
  });

  it("모르는 값이면 기본 언어다", () => {
    /**
     * `?lang=` 은 사용자가 아무거나 적을 수 있는 자리다. 여기서 예외가 나면
     * 장난친 URL 하나로 페이지가 통째로 500 이 된다.
     */
    for (const value of [undefined, null, "", "FR", 42, {}, [], ["zz"]]) {
      expect(resolveLocale(value), String(value)).toBe(DEFAULT_LOCALE);
    }
  });

  it("배열로 와도 첫 번째를 본다", () => {
    // `?lang=en&lang=ko` 는 배열로 파싱된다.
    expect(resolveLocale(["en", "ko"])).toBe("en");
  });
});

describe("원고의 다국어 문자열", () => {
  it("문자열 하나면 모든 언어가 그걸 쓴다", () => {
    // 번역을 강요하지 않는 게 요점이다 — 한 언어만 적어도 화면이 안 깨진다.
    const text: LocalizedText = "그냥 한 줄";
    for (const locale of LOCALES) expect(pick(text, locale)).toBe("그냥 한 줄");
  });

  it("언어별로 갈라 적으면 갈라 쓴다", () => {
    const text: LocalizedText = { ko: "안녕", en: "hello" };
    expect(pick(text, "ko")).toBe("안녕");
    expect(pick(text, "en")).toBe("hello");
  });

  it("한쪽만 적었으면 있는 쪽으로 메운다", () => {
    // 빈 화면보다 다른 언어라도 보이는 게 낫다.
    expect(pick({ ko: "안녕" }, "en")).toBe("안녕");
    expect(pick({ en: "hello" }, "ko")).toBe("hello");
  });
});

describe("문구 사전", () => {
  it("모든 언어가 같은 모양이다", () => {
    /**
     * `en: Dict` 타입이 이미 빠진 키를 컴파일 단계에서 막지만, 그건 **키**만 본다.
     * 실수로 한글을 그대로 복사해 둔 항목은 타입으로 못 잡는다.
     */
    const ko = stringsFor("ko");
    const en = stringsFor("en");
    expect(Object.keys(en)).toEqual(Object.keys(ko));
    expect(Object.keys(en.fishing.catchables)).toEqual(
      Object.keys(ko.fishing.catchables),
    );
  });

  it("영어 사전에 한글이 남아 있지 않다", () => {
    // 번역을 빼먹고 한글을 그대로 둔 항목을 잡는다.
    const hangul = /[가-힣]/;
    const offenders: string[] = [];

    const walk = (value: unknown, path: string): void => {
      if (typeof value === "string") {
        if (hangul.test(value)) offenders.push(`${path}: ${value}`);
        return;
      }
      if (typeof value === "function") {
        // 인자가 있는 문구. 숫자 하나를 넣어 결과만 본다.
        const rendered = (value as (...args: unknown[]) => unknown)(1, false);
        if (typeof rendered === "string" && hangul.test(rendered)) {
          offenders.push(`${path}(): ${rendered}`);
        }
        return;
      }
      if (value && typeof value === "object") {
        for (const [key, child] of Object.entries(value)) {
          walk(child, `${path}.${key}`);
        }
      }
    };

    walk(stringsFor("en"), "en");
    expect(offenders).toEqual([]);
  });

  it("한국어 사전에 빈 문구가 없다", () => {
    const empties: string[] = [];
    const walk = (value: unknown, path: string): void => {
      if (typeof value === "string") {
        if (value.trim().length === 0) empties.push(path);
        return;
      }
      if (value && typeof value === "object" && typeof value !== "function") {
        for (const [key, child] of Object.entries(value)) {
          walk(child, `${path}.${key}`);
        }
      }
    };
    for (const locale of LOCALES) walk(stringsFor(locale), locale);
    expect(empties).toEqual([]);
  });
});
