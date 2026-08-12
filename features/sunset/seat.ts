"use client";

import { create } from "zustand";

/**
 * 지금 어느 의자에 앉아 있는가.
 *
 * 앉았다는 사실 자체는 여기 있지만, **남에게 보이는 앉음**은 활동 상태로
 * 따로 나간다(game/net/activity). 둘을 하나로 합치지 않는 이유는 층이 다르기
 * 때문이다 — 어느 의자인지는 이 컨텐츠만 알면 되고, 앉아 있다는 사실은
 * 캐릭터를 그리는 쪽(LocalPlayer · RemotePlayers)이 알아야 한다.
 */
interface SeatState {
  /** 앉은 의자 번호. null 이면 서 있다. */
  index: number | null;
  sit(index: number): void;
  stand(): void;
}

export const useSeatStore = create<SeatState>()((set) => ({
  index: null,
  sit: (index) => set({ index }),
  stand: () => set({ index: null }),
}));
