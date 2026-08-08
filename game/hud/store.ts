"use client";

import { create } from "zustand";

/**
 * HUD 상태. **저빈도 상태만** 들어온다.
 *
 * 여기 들어오는 값이 바뀌면 리렌더가 돈다. 그래서 "지금 가까이 있는 오브젝트가 바뀌었다",
 * "패널이 열렸다" 같은 이벤트성 변화만 담는다. 좌표는 절대 안 들어온다. (기획서 §4.1)
 */
interface HudState {
  nearbyId: string | null;
  nearbyLabel: string | null;
  /** 열려 있는 2D 패널의 id. feature 가 자기 id 를 넣는다. */
  openPanelId: string | null;
  /**
   * 채팅 입력이 펼쳐져 있는가.
   *
   * 모바일에서 입력창이 열리면 조이스틱과 액션 버튼을 치운다 — 글을 쓰는 동안
   * 걸어다닐 일이 없고, 무엇보다 소프트 키보드가 올라오면 그 자리를 차지한다.
   * ChatComposer 혼자 알고 있으면 TouchControls 가 비켜줄 방법이 없어서 여기 둔다.
   */
  chatOpen: boolean;
  setNearby(id: string | null, label: string | null): void;
  openPanel(id: string): void;
  closePanel(): void;
  setChatOpen(open: boolean): void;
}

export const useHudStore = create<HudState>()((set) => ({
  nearbyId: null,
  nearbyLabel: null,
  openPanelId: null,
  chatOpen: false,
  setNearby: (nearbyId, nearbyLabel) => set({ nearbyId, nearbyLabel }),
  openPanel: (openPanelId) => set({ openPanelId }),
  closePanel: () => set({ openPanelId: null }),
  setChatOpen: (chatOpen) => set({ chatOpen }),
}));
