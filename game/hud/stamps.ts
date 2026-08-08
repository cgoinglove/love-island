"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";

/**
 * 도장.
 *
 * ── 왜 잠그나 ──
 * 들어오면 게시판 · 책상 · 사진첩이 다 보이고 3분이면 볼 게 없었다. 섬은 넓은데
 * 걸어다닐 이유가 없었다는 뜻이다. 몇 가지를 해봐야 열리게 하면 그 사이에
 * 섬을 한 바퀴 돌게 된다.
 *
 * ── 무엇을 잠그지 않는가 ──
 * **경력은 절대 안 잠근다.** 이건 포트폴리오다. 채용 담당자가 미니게임을 하다
 * 지쳐서 작품을 못 보고 나가면 앱이 목적을 배신한 것이다. 잠그는 건 사진첩과
 * 방명록 — 재미로 보는 것과 남기는 것뿐이다.
 *
 * ── 왜 localStorage 인가 ──
 * 서버에 두면 계정이 필요해진다. 도장은 자랑거리가 아니라 안내 장치라,
 * 남이 못 믿게 만드는 것보다 로그인 없이 굴러가는 게 훨씬 중요하다.
 * 개발자 도구로 지울 수 있는데, 그럴 사람은 어차피 다 볼 자격이 있다.
 */

export interface StampDef {
  id: string;
  label: string;
  hint: string;
}

/**
 * 모아야 하는 도장.
 *
 * 셋 다 1분 안에 끝난다 — 봇에게 말 걸기 · 섬 반대편 가보기 · 낚싯대 던져보기.
 * 어렵게 만들면 잠금이 벽이 되고, 벽이 되면 사람들은 그냥 나간다.
 */
export const STAMPS: readonly StampDef[] = [
  {
    id: "greeted",
    label: "봇과 인사",
    hint: "안내 봇 cgoing-bot 에게 조작법을 물어보세요",
  },
  {
    id: "explored",
    label: "섬 한 바퀴",
    hint: "섬 반대편 끝까지 걸어가 보세요",
  },
  {
    id: "fished",
    label: "첫 낚시",
    hint: "물가에서 낚싯대를 던져보세요",
  },
];

export const STAMP_GOAL = STAMPS.length;

interface StampState {
  earned: Record<string, number>;
  /** 방금 찍혀서 화면에 알릴 도장. 한 번 보여주고 지운다. */
  toast: StampDef | null;
  award(id: string): void;
  clearToast(): void;
}

export const useStampStore = create<StampState>()(
  persist(
    (set, get) => ({
      earned: {},
      toast: null,
      award: (id) => {
        // 이미 있으면 아무 일도 안 한다 — 같은 도장으로 두 번 축하하면 김이 샌다.
        if (get().earned[id]) return;
        const def = STAMPS.find((stamp) => stamp.id === id);
        set((state) => ({
          earned: { ...state.earned, [id]: Date.now() },
          toast: def ?? null,
        }));
      },
      clearToast: () => set({ toast: null }),
    }),
    { name: "love-island:stamps" },
  ),
);

/** 리액트 밖(봇 · 낚시)에서 도장을 찍을 때 쓴다. */
export function awardStamp(id: string): void {
  useStampStore.getState().award(id);
}

export function hasStamp(id: string): boolean {
  return Boolean(useStampStore.getState().earned[id]);
}

/** 도장을 다 모았나. 사진첩·방명록의 잠금이 이걸 본다. */
export function isUnlocked(earned: Record<string, number>): boolean {
  return STAMPS.every((stamp) => Boolean(earned[stamp.id]));
}
