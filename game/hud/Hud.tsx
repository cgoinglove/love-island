"use client";

import { useEffect, useState } from "react";
import { SIGN } from "@/components/island/ui";
import { usePlayerController } from "@/game/core/playerControl";
import { usePresenceStore } from "@/game/net/presence";
import { OWNER_NAME } from "@/shared/constants";
import { LOCALES } from "@/shared/i18n";
import { currentLocale, t } from "@/shared/strings";
import { ChatComposer } from "./ChatComposer";
import { InteractionPrompt } from "./InteractionPrompt";
import { Shortcuts } from "./Shortcuts";
import { useHudStore } from "./store";
import { TouchControls } from "./TouchControls";

/**
 * 화면 위에 얹히는 2D 레이어.
 *
 * shadcn 을 쓰지 않고 직접 짠다. HUD 는 "다이얼로그 · 폼" 같은 일반 UI 가 아니라
 * 게임 화면을 가리지 않아야 하는 오버레이라서, 컴포넌트 라이브러리의 기본값
 * (배경 딤, 포커스 트랩, 스크롤 잠금)이 전부 방해가 된다. (기획서 §10)
 */
export function Hud({ minimap }: { minimap?: React.ReactNode }) {
  const openPanelId = useHudStore((state) => state.openPanelId);
  const online = usePresenceStore((state) => state.online);
  const direct = usePresenceStore((state) => state.direct);
  const controllerRef = usePlayerController();
  const immersive = useHudStore((state) => state.immersive);
  const [booted, setBooted] = useState(false);

  // 인트로 카메라가 도는 3초 동안은 HUD 를 감춘다. 첫 화면은 섬만 보여준다.
  useEffect(() => {
    const timer = setTimeout(() => setBooted(true), 2600);
    return () => clearTimeout(timer);
  }, []);

  // F 로 밀친다. Space(점프)·Enter(채팅)와 겹치지 않는 자리를 골랐다.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.code !== "KeyF") return;
      const target = event.target as HTMLElement | null;
      if (
        target?.tagName === "INPUT" ||
        target?.tagName === "TEXTAREA" ||
        target?.isContentEditable
      ) {
        return;
      }
      event.preventDefault();
      controllerRef.current?.shove();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [controllerRef]);

  const panelOpen = openPanelId !== null;

  if (!booted) {
    return (
      <div className="-translate-x-1/2 pointer-events-none fixed bottom-10 left-1/2 z-10 text-center">
        <p className="font-bold text-[13px] text-white/80 tracking-[0.3em] drop-shadow">
          {OWNER_NAME.toUpperCase()}
        </p>
      </div>
    );
  }

  return (
    <>
      {/* 좌상단 상태 바. 터미널 프롬프트처럼 읽히게 한다 */}
      <header className="fade-in pointer-events-none fixed top-4 left-4 z-10 animate-in select-none">
        {/*
          간판 하나로 합쳤다. 예전엔 칩 두 개가 위아래로 붙어 있었는데,
          웹사이트의 로고+태그라인 배치라 화면에서 붕 떠 보였다.
        */}
        <div className={`flex items-center gap-2.5 px-3.5 py-2 ${SIGN}`}>
          <span className="size-2.5 animate-pulse rounded-full bg-[#5e9c55] ring-2 ring-[#4a3428]" />
          <span className="font-bold text-[14px] text-[#3a2a22]">
            {t().siteName}
          </span>
          <span className="h-4 w-[2px] rounded bg-[#d9c9a8]" />
          <span className="font-bold text-[13px] text-[#8a7460] tabular-nums">
            {t().hud.online(online)}
          </span>
          {direct > 0 && (
            <span className="rounded-full bg-[#5e9c55] px-2 py-0.5 font-bold text-[10px] text-[#fdf6e8]">
              p2p
            </span>
          )}

          {/*
            언어 전환.

            ⚠ `<a>` 다 — 클라이언트 라우팅으로 넘어가면 언어가 안 바뀐다.
              언어는 씬이 뜨기 **전에** 한 번 정해지는 값이라(shared/strings.ts),
              같은 씬을 유지한 채 URL 만 갈면 이미 그려진 문구가 그대로 남는다.
              통째로 새로 여는 게 이 설계에서는 맞는 동작이다.
          */}
          <span className="pointer-events-auto flex items-center gap-1">
            {LOCALES.map((code) => (
              <a
                key={code}
                href={code === "ko" ? "/" : `/${code}`}
                className={`rounded-md px-1.5 py-0.5 font-bold text-[10px] uppercase tracking-wide transition ${
                  code === currentLocale()
                    ? "bg-[#4a3428] text-[#fdf6e8]"
                    : "text-[#a8967f] hover:text-[#3a2a22]"
                }`}
              >
                {code}
              </a>
            ))}
          </span>
        </div>
      </header>

      {minimap}
      {!immersive && <InteractionPrompt />}
      {/*
        앉아도 채팅은 남는다. **둘이 나란히 앉아 얘기하면서 보는 것**이
        이 자리의 용도라, 여기서 입을 막으면 의자가 혼자 앉는 자리가 된다.
        대신 걸어다니는 조작(조이스틱 · 단축키 안내)은 접는다.
      */}
      {!panelOpen && <ChatComposer />}
      {!panelOpen && !immersive && <TouchControls />}
      {!panelOpen && !immersive && <Shortcuts />}
    </>
  );
}
