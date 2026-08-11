"use client";

import dynamic from "next/dynamic";
import { useEffect } from "react";
import { OWNER_NAME } from "@/shared/constants";
import type { Locale } from "@/shared/i18n";
import { setLocale } from "@/shared/strings";

/**
 * WebGL 은 서버에서 렌더할 수 없다. ssr: false 로 잘라내지 않으면
 * three 와 leva 가 서버 번들에 끌려 들어가고, document 를 만지는 순간 빌드가 깨진다.
 */
const IslandScene = dynamic(
  () => import("./IslandScene").then((m) => m.IslandScene),
  {
    ssr: false,
    /**
     * 로딩 문구는 **번역하지 않는다.**
     *
     * 이 화면은 언어가 정해지기 전에, 그리고 서버에서도 그려진다. 거기서 전역 언어를
     * 읽으면 요청끼리 섞일 수 있다(shared/strings.ts 의 경고). 터미널 한 줄이라
     * 어느 언어권에서나 그대로 읽히므로 여기만 영어로 고정한다.
     */
    loading: () => (
      <div className="fixed inset-0 grid place-items-center bg-[#0b1016]">
        <div className="text-center font-mono">
          <p className="text-[12px] text-emerald-400">
            <span className="text-slate-600">$ </span>ssh {OWNER_NAME}@island
          </p>
          <p className="mt-2 text-[11px] text-slate-500">
            connecting<span className="animate-pulse">_</span>
          </p>
        </div>
      </div>
    ),
  },
);

/**
 * 언어를 정하고 씬을 띄운다.
 *
 * ⚠ `setLocale` 을 **렌더 도중** 부른다. effect 로 미루면 씬이 한글로 한 번 그려진
 *   다음에 영어로 바뀌어 화면이 깜빡인다. 자식은 부모 렌더가 끝난 뒤에 그려지므로
 *   이 한 줄이면 씬 전체가 처음부터 옳은 언어로 시작한다.
 */
export function GameStage({ locale }: { locale: Locale }) {
  setLocale(locale);

  // 스크린 리더와 브라우저 번역기가 보는 값. 레이아웃은 라우트를 모르므로 여기서 고친다.
  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);

  return <IslandScene />;
}
