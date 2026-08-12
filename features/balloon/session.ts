"use client";

import { create } from "zustand";

/**
 * 열기구에 타고 있는가.
 *
 * 어느 자리에 서는지(바구니 안 네 귀퉁이)는 여기 없다 — playerId 로 정해지므로
 * 각자 계산하면 되고, 그래야 남의 화면에서도 같은 자리에 선다.
 */
interface RideState {
  riding: boolean;
  board(): void;
  leave(): void;
}

export const useRideStore = create<RideState>()((set) => ({
  riding: false,
  board: () => set({ riding: true }),
  leave: () => set({ riding: false }),
}));
