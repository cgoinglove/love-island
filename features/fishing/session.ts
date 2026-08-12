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
  /** 챘다. 물속에서 버티는 놈과 씨름하는 중. */
  | "fighting"
  /** 놓쳤다. */
  | "missed"
  /** 잡았다. */
  | "caught";

export interface CaughtInfo {
  item: Catchable;
  at: string;
}

interface FishingState {
  stage: FishingStage;
  /** 이 시각에 다음 단계로 넘어간다(서버 보정 epoch ms). 3D 쪽이 진행도를 잰다. */
  stageUntil: number;
  /**
   * 씨름이 끝나면 보여줄 것. **씨름하는 동안 이미 정해져 있다.**
   *
   * 결과는 챈 순간 그 자리에서 굴린다(FishingHud). 그래야 물 밖으로 튀어나오는
   * 게 커피면 물보라가 금색이고 꽝이면 흰색인 식으로, 연출이 결과를 알고 움직인다.
   * 카드만 마지막에 뜬다.
   */
  pending: Catchable | null;
  caught: CaughtInfo | null;
  set(stage: FishingStage, until?: number): void;
  startFight(item: Catchable, until: number): void;
  land(info: CaughtInfo): void;
  leave(): void;
}

export const useFishingStore = create<FishingState>()((set) => ({
  stage: "away",
  stageUntil: 0,
  pending: null,
  caught: null,
  set: (stage, until = 0) => set({ stage, stageUntil: until }),
  startFight: (pending, until) =>
    set({ stage: "fighting", stageUntil: until, pending, caught: null }),
  land: (caught) => set({ stage: "caught", caught, pending: null }),
  leave: () =>
    set({ stage: "away", caught: null, pending: null, stageUntil: 0 }),
}));

/** 찌가 날아가는 시간(초). 던지는 맛이 나려면 짧아도 순간이면 안 된다. */
export const CAST_SECONDS = 0.75;
/**
 * 찌가 떨어지는 거리(m).
 *
 * 9m 였다. 물 깊이는 그쪽이 낫지만 화면에서 찌가 왼쪽 가장자리에 붙었다 —
 * 카메라 화각이 24m 거리에서 좌우 ±12m 라, 8m 만 나가도 이미 3분의 2 지점이다.
 * 챈 뒤에 벌어지는 일을 보라고 만든 연출이므로 **보이는 자리**가 우선이다.
 */
export const CAST_DISTANCE = 6.5;
/** 입질까지. 매번 달라야 미리 누르는 걸 막는다. */
export const WAIT_MIN_MS = 1400;
export const WAIT_MAX_MS = 4200;
/** 입질 후 챌 수 있는 시간. 짧으면 운, 길면 긴장이 없다. */
export const BITE_WINDOW_MS = 950;

/**
 * 챈 뒤 물 밖으로 나오기까지(ms).
 *
 * ⚠ 예전에 여기가 **서버 왕복**이었다. 화면에는 "끌어올리는 중…" 이라고 적힌 채
 *   아무 일도 일어나지 않았고, 배포 환경에서는 그게 눈에 띄게 길었다.
 *   같은 1초라도 아무것도 안 하며 기다리는 1초와, 낚싯대가 휘고 물보라가 튀는
 *   1초는 전혀 다른 시간이다. 지금은 결과를 챈 즉시 정하고 이 시간은 온전히
 *   연출에 쓴다 — 기다림이 아니라 그 판의 절정이다.
 */
export const FIGHT_MS = 1150;
