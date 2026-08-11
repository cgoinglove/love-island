"use client";

import { useEffect, useState } from "react";
import type { Locale } from "@/shared/i18n";
import { stringsFor } from "@/shared/strings";

/**
 * 섬으로 들어가는 동안 뜨는 화면.
 *
 * ── 왜 터미널이 아니라 배인가 ──
 * 전엔 `$ ssh cgoing@island / connecting_` 이었다. 개발자스럽긴 했는데 그 뒤에 나오는
 * 게 3D 섬이라 화면이 서로 다른 물건이었고, 무엇보다 **기다리는 동안 아무 일도 안 났다.**
 * 로딩이 길게 느껴지는 건 대개 시간이 길어서가 아니라 그 시간이 비어 있어서다.
 *
 * 지금은 배가 섬으로 건너간다. 세계 안에서 벌어지는 일로 보이고, 조작법 한 줄이
 * 3초마다 바뀌므로 기다리는 동안 읽을 게 생긴다 — 도착하면 바로 쓸 수 있는 것들이다.
 *
 * ── 왜 언어를 인자로 받나 ──
 * 이 화면은 씬보다 먼저, **서버에서도** 그려진다. 전역 언어(`t()`)를 서버에서 읽으면
 * 요청끼리 섞일 수 있어서(shared/strings.ts 의 경고) 언어를 손에 들고 내려온다.
 */

/** 조작법 한 줄이 바뀌는 간격(ms). 읽을 만큼은 머물러야 한다. */
const TIP_INTERVAL_MS = 3000;

export function Boarding({
  locale,
  leaving,
}: {
  locale: Locale;
  /** 도착했다. 사라지는 중이라 클릭을 안 먹는다. */
  leaving: boolean;
}) {
  const copy = stringsFor(locale).boarding;
  const [tip, setTip] = useState(0);

  useEffect(() => {
    const timer = setInterval(
      () => setTip((n) => (n + 1) % copy.tips.length),
      TIP_INTERVAL_MS,
    );
    return () => clearInterval(timer);
  }, [copy.tips.length]);

  return (
    <div
      className={`fixed inset-0 z-50 flex flex-col items-center justify-center overflow-hidden bg-[#9ec9e2] transition-opacity duration-500 ${
        leaving ? "pointer-events-none opacity-0" : "opacity-100"
      }`}
    >
      {/* 하늘. 위가 더 짙어야 하늘로 읽힌다 — 게임 안 하늘과 같은 색이다. */}
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-[#7fb8d8] via-[#9ec9e2] to-[#cfe6f2]" />

      {/* 수평선 아래는 바다. 게임의 바다색을 그대로 쓴다. */}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-[38%] bg-gradient-to-b from-[#2a7fa8] to-[#175c80]" />

      {/* 저 멀리 섬. 하트인 게 이 섬의 이름이다. */}
      <div
        aria-hidden
        className="pointer-events-none absolute right-[12%] bottom-[38%] text-[34px] opacity-35 blur-[0.4px] sm:text-[44px]"
      >
        🏝️
      </div>

      <div className="relative z-10 flex flex-col items-center px-8 text-center">
        <p className="font-black text-[24px] text-[#173a4d] drop-shadow-[0_2px_0_rgba(255,255,255,0.45)] sm:text-[30px]">
          {copy.title}
        </p>
        <p className="mt-1.5 font-semibold text-[14px] text-[#2a5d78]">
          {copy.subtitle}
          <span className="animate-pulse">…</span>
        </p>

        {/*
          배가 건너간다. 왼쪽 밖에서 오른쪽 밖으로 — 진행률을 아는 척하지 않는다.
          실제 진행을 모르는데 막대를 채우면 그건 거짓말이고, 80% 에서 멈춰 있는
          막대가 아무것도 없는 것보다 더 답답하다.
        */}
        <div className="relative mt-7 h-10 w-[min(22rem,80vw)]">
          <div className="absolute inset-x-0 bottom-2 h-[3px] rounded-full bg-[#173a4d]/15" />
          <span
            aria-hidden
            className="absolute bottom-1 animate-[boarding-sail_3.4s_ease-in-out_infinite] text-[26px]"
          >
            ⛵
          </span>
        </div>
      </div>

      {/* 기다리는 동안 읽을 것. 도착하면 바로 쓸 수 있는 것들만. */}
      <p
        key={tip}
        className="fade-in absolute inset-x-0 bottom-[max(2rem,env(safe-area-inset-bottom))] z-10 animate-in px-8 text-center font-semibold text-[13px] text-[#e8f3f8] duration-500"
      >
        💡 {copy.tips[tip]}
      </p>
    </div>
  );
}
