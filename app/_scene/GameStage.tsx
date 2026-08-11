"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useState } from "react";
import type { Locale } from "@/shared/i18n";
import { setLocale } from "@/shared/strings";
import { Boarding } from "./Boarding";

/**
 * WebGL 은 서버에서 렌더할 수 없다. ssr: false 로 잘라내지 않으면
 * three 와 leva 가 서버 번들에 끌려 들어가고, document 를 만지는 순간 빌드가 깨진다.
 */
const IslandScene = dynamic(
  () => import("./IslandScene").then((m) => m.IslandScene),
  {
    /**
     * WebGL 은 서버에서 렌더할 수 없다. ssr: false 로 잘라내지 않으면
     * three 와 leva 가 서버 번들에 끌려 들어가고, document 를 만지는 순간 빌드가 깨진다.
     */
    ssr: false,
    /**
     * 로딩 화면은 여기가 아니라 GameStage 가 그린다.
     *
     * dynamic 의 `loading` 은 **props 를 못 받는다.** 언어를 넘길 방법이 없어서
     * 예전엔 문구를 영어로 고정해뒀는데, 그러면 한국어로 들어온 사람이 첫 화면부터
     * 영어를 본다. 형제로 얹으면 언어를 손에 들고 내려줄 수 있고, 덤으로
     * **청크 로드가 아니라 첫 프레임까지** 화면을 붙잡아 둘 수 있다.
     */
    loading: () => null,
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

  const [arrived, setArrived] = useState(false);
  const onReady = useCallback(() => setArrived(true), []);

  // 스크린 리더와 브라우저 번역기가 보는 값. 레이아웃은 라우트를 모르므로 여기서 고친다.
  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);

  return (
    <>
      <IslandScene onReady={onReady} />
      {/*
        도착해도 바로 안 지운다. 0.5초 동안 사라지면서 섬이 드러나는 게
        툭 끊기는 것보다 낫다 — 그동안 카메라 인트로가 이미 돌고 있다.
      */}
      <Boarding locale={locale} leaving={arrived} />
    </>
  );
}
