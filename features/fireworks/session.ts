"use client";

import { create } from "zustand";

/**
 * 발사대 앞에 서 있는가.
 *
 * 낚시와 같은 구조다 — 패널을 여는 게 아니라 **모드로 들어간다.** 모달이 뜨면
 * 그 순간 3D 가 배경이 되고, 배경이 된 하늘에 폭죽을 쏘는 건 의미가 없다.
 *
 * 차오르는 정도는 여기 없다. 그건 매 프레임 바뀌는 값이라 상태로 두면
 * 초당 60번 리렌더가 돈다 — HUD 가 ref 로 직접 그린다.
 */
interface LauncherState {
  active: boolean;
  enter(): void;
  leave(): void;
}

export const useLauncherStore = create<LauncherState>()((set) => ({
  active: false,
  enter: () => set({ active: true }),
  leave: () => set({ active: false }),
}));
