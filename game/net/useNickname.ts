"use client";

import { useSyncExternalStore } from "react";
import { NICKNAME_STORAGE_KEY } from "@/shared/constants";

/**
 * 내 닉네임. localStorage 하나가 유일한 출처다.
 *
 * 방명록에서 이름을 적으면 머리 위 이름표도 같이 바뀌어야 하는데, 둘은 서로를
 * 모른다. storage 이벤트는 **다른 탭에서만** 오므로 같은 탭 안에서는 안 온다 —
 * 그래서 저장하는 쪽이 커스텀 이벤트를 쏘고, 여기서 그걸 같이 듣는다.
 */
const CHANGED_EVENT = "love-island:nickname-changed";

export function setNickname(value: string): void {
  localStorage.setItem(NICKNAME_STORAGE_KEY, value);
  window.dispatchEvent(new Event(CHANGED_EVENT));
}

function subscribe(onChange: () => void): () => void {
  window.addEventListener("storage", onChange);
  window.addEventListener(CHANGED_EVENT, onChange);
  return () => {
    window.removeEventListener("storage", onChange);
    window.removeEventListener(CHANGED_EVENT, onChange);
  };
}

function read(): string | null {
  return localStorage.getItem(NICKNAME_STORAGE_KEY);
}

/** 서버 렌더에는 닉네임이 없다. 하이드레이션 불일치를 피하려면 null 이어야 한다. */
function readServer(): string | null {
  return null;
}

export function useNickname(): string | null {
  return useSyncExternalStore(subscribe, read, readServer);
}
