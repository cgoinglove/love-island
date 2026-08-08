"use client";

import { useEffect } from "react";
import { CHUNKY, SIGN_ACCENT } from "@/components/island/ui";
import { getInteractable } from "@/game/core/interactable";
import { useHudStore } from "./store";
import { useTouchMode } from "./touch";

const INTERACT_KEYS = new Set(["KeyE", "Space", "Enter"]);

/**
 * 가까이 갔을 때 뜨는 프롬프트.
 *
 * feature 는 이 컴포넌트의 존재를 모른다. Interactable 을 등록했을 뿐인데
 * 프롬프트도, E 키도, 탭도 전부 붙어 있다. 이게 등록 방식의 값어치다. (기획서 §4.3)
 */
export function InteractionPrompt() {
  const nearbyId = useHudStore((state) => state.nearbyId);
  const nearbyLabel = useHudStore((state) => state.nearbyLabel);
  const openPanelId = useHudStore((state) => state.openPanelId);
  const touch = useTouchMode();

  useEffect(() => {
    if (nearbyId === null || openPanelId !== null) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (!INTERACT_KEYS.has(event.code)) return;
      event.preventDefault();
      getInteractable(nearbyId)?.onInteract();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [nearbyId, openPanelId]);

  if (nearbyId === null || nearbyLabel === null || openPanelId !== null)
    return null;

  return (
    <button
      type="button"
      onClick={() => getInteractable(nearbyId)?.onInteract()}
      /**
       * 손가락 화면에서는 더 높이 뜬다. 아래 가장자리는 조이스틱과 액션 버튼이
       * 이미 다 쓰고 있어서, 데스크톱 높이(bottom-24)로 두면 그 위에 겹친다.
       */
      className={`-translate-x-1/2 fade-in slide-in-from-bottom-2 fixed left-1/2 z-20 flex animate-in items-center gap-2.5 px-5 py-2.5 font-bold text-[15px] hover:brightness-[1.05] ${
        touch ? "bottom-64" : "bottom-24"
      } ${SIGN_ACCENT} ${CHUNKY}`}
    >
      {/* 키보드가 없는 기기에 단축키를 알려줄 이유가 없다. */}
      {!touch && (
        <kbd className="rounded-md bg-[#fff6ef]/25 px-2 py-0.5 font-bold text-[12px]">
          E
        </kbd>
      )}
      {nearbyLabel}
    </button>
  );
}
