"use client";

import { useEffect } from "react";
import { create } from "zustand";

/**
 * "지금 손가락으로 놀고 있는가".
 *
 * ── 왜 공유 상태인가 ──
 * 예전엔 TouchControls 가 혼자 알고 혼자 숨었다. 그러다 보니 채팅 독은 자기가
 * 조이스틱 위에 겹쳐 앉아 있다는 걸 몰랐다 — 데스크톱에서는 조이스틱이 없으니
 * 개발 중엔 영영 안 보이는 종류의 버그다. 조작 UI 가 서로 자리를 비켜주려면
 * **누가 화면 어디를 쓰는지**를 한 곳에서 알아야 한다.
 *
 * ── 왜 "터치 가능한 기기" 가 아니라 "터치가 들어왔는가" 인가 ──
 * 요즘 노트북은 터치스크린이 달려 있어도 대부분 키보드로 논다. 기기 능력으로
 * 판정하면 그 사람들 화면에 쓰지도 않을 조이스틱이 깔린다.
 */
interface TouchState {
  touch: boolean;
  markTouch(): void;
}

const useTouchStore = create<TouchState>()((set) => ({
  touch: false,
  markTouch: () => set({ touch: true }),
}));

/** 리스너는 한 번만 붙인다. 여러 컴포넌트가 이 훅을 불러도 상관없게. */
let watching = false;

function watch(): void {
  if (watching || typeof window === "undefined") return;
  watching = true;
  window.addEventListener(
    "touchstart",
    () => useTouchStore.getState().markTouch(),
    { once: true, passive: true },
  );
}

export function useTouchMode(): boolean {
  useEffect(watch, []);
  return useTouchStore((state) => state.touch);
}
