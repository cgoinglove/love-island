"use client";

import { create } from "zustand";
import type { Catchable } from "@/shared/fishing";

/**
 * 낚시 진행 상태.
 *
 * ── 왜 팝업이 아닌가 ──
 * 처음엔 모달 안에서 파란 네모와 버튼으로 끝냈다. 동작은 했지만 그건 게임이 아니라
 * **게임의 설명서**였다 — 섬을 걸어와서 열었는데 갑자기 웹 폼이 뜬다.
 *
 * 지금은 캐릭터가 실제로 낚싯대를 들고 찌를 물에 던진다. 화면에 남는 UI 는
 * 지금 뭘 눌러야 하는지 알려주는 한 줄뿐이고, 나머지는 3D 로 벌어진다.
 * 잡은 결과만 카드로 띄운다 — 쿠폰은 캡처해서 보내야 하니 읽을 수 있어야 한다.
 *
 * ── 왜 zustand 인가 ──
 * 3D(낚싯대·찌)와 HUD(안내 문구)가 같은 상태를 봐야 하는데 둘은 다른 트리에 있다.
 * 상태 전환은 초당 몇 번 수준이라 리렌더가 문제되지 않는다 —
 * 매 프레임 바뀌는 값(찌의 실제 좌표)은 여기 안 넣는다.
 */

export type FishingStage =
  /** 낚시터 밖. 아무 일도 없다. */
  | "away"
  /** 자리에 섰다. 던지기를 기다린다. */
  | "ready"
  /** 찌가 날아가는 중. */
  | "casting"
  /** 물에 떠서 기다린다. */
  | "waiting"
  /** 입질. 이때 눌러야 한다. */
  | "bite"
  /** 서버에 물어보는 중. */
  | "reeling"
  /** 놓쳤다. */
  | "missed"
  /** 잡았다. */
  | "caught";

export interface CaughtInfo {
  item: Catchable;
  code: string | null;
  at: string;
}

interface FishingState {
  stage: FishingStage;
  /** 이 시각에 다음 단계로 넘어간다(서버 보정 epoch ms). 3D 쪽이 진행도를 잰다. */
  stageUntil: number;
  caught: CaughtInfo | null;
  error: string | null;
  set(stage: FishingStage, until?: number): void;
  setCaught(info: CaughtInfo): void;
  setError(message: string): void;
  leave(): void;
}

export const useFishingStore = create<FishingState>()((set) => ({
  stage: "away",
  stageUntil: 0,
  caught: null,
  error: null,
  set: (stage, until = 0) => set({ stage, stageUntil: until, error: null }),
  setCaught: (caught) => set({ stage: "caught", caught, error: null }),
  setError: (error) => set({ stage: "ready", error }),
  leave: () => set({ stage: "away", caught: null, error: null }),
}));

/** 찌가 날아가는 시간(초). 던지는 맛이 나려면 짧아도 순간이면 안 된다. */
export const CAST_SECONDS = 0.75;
/** 찌가 떨어지는 거리(m). 물가에서 이만큼 앞. */
export const CAST_DISTANCE = 9;
/** 입질까지. 매번 달라야 미리 누르는 걸 막는다. */
export const WAIT_MIN_MS = 1400;
export const WAIT_MAX_MS = 4200;
/** 입질 후 챌 수 있는 시간. 짧으면 운, 길면 긴장이 없다. */
export const BITE_WINDOW_MS = 950;
