import { z } from "zod";

/**
 * 낚시 전리품표.
 *
 * ── 왜 shared 인가 ──
 * 확률과 굴림은 **서버가** 한다(server/fishing). 클라이언트가 "전설 뽑았다"고
 * 주장할 수 있으면 진짜 커피를 걸 수 없기 때문이다. 다만 화면은 잡은 것의 이름과
 * 그림을 알아야 하므로, **표는 공유하되 주사위는 서버만 굴린다.**
 *
 * ── 확률 설계 ──
 * **거의 다 꽝이다.** 등급을 다섯 개 두고 물고기며 배경화면이며 늘어놨었는데,
 * 그것들은 받아도 아무 일도 안 일어나는 물건이라 결국 "꽝인데 이름만 다른 것"
 * 이었다. 이름을 늘리는 건 재미가 아니라 소음이다.
 *
 * 남은 건 둘뿐이다 — **꽝**, 그리고 아주 드물게 **진짜 커피 쿠폰**.
 * 걸린 게 하나뿐이라 오히려 그 하나가 무엇인지 분명해진다.
 * 꽝도 매번 다른 걸 건져 올린다. 빈 낚싯줄만 계속 올라오면 그냥 지루하다.
 */

export const REWARD_TIERS = ["junk", "real"] as const;
export type RewardTier = (typeof REWARD_TIERS)[number];

export interface Catchable {
  id: string;
  name: string;
  emoji: string;
  tier: RewardTier;
  /** 잡았을 때 한 줄. 보상 설명이거나 농담이다. */
  blurb: string;
  /**
   * 뽑기 가중치. 확률이 아니라 **무게**다 —
   * 항목을 하나 추가할 때 다른 값을 다시 계산할 필요가 없다.
   */
  weight: number;
  /** 쿠폰으로 만들어 보낼 수 있는가. real 등급만 참이다. */
  redeemable?: boolean;
}

export const CATCHABLES: readonly Catchable[] = [
  /**
   * ── 꽝 ──
   * 전부 꽝이다. 건져 올린 물건이 다를 뿐이라 화면에는 크게 "꽝"이라고 뜬다.
   * 이름이 다르다고 등급이 다른 척하지 않는다.
   */
  {
    id: "nothing",
    name: "빈 낚싯줄",
    emoji: "〰️",
    tier: "junk",
    weight: 150,
    blurb: "아무것도 안 걸렸습니다. 이런 날도 있죠.",
  },
  {
    id: "boot",
    name: "낡은 장화",
    emoji: "🥾",
    tier: "junk",
    weight: 140,
    blurb: "한 짝뿐입니다. 나머지 한 짝은 어디 갔을까요.",
  },
  {
    id: "seaweed",
    name: "미역 한 줌",
    emoji: "🌿",
    tier: "junk",
    weight: 130,
    blurb: "국 끓이기엔 좀 모자랍니다.",
  },
  {
    id: "can",
    name: "찌그러진 캔",
    emoji: "🥫",
    tier: "junk",
    weight: 120,
    blurb: "누가 버린 걸까요. 주웠으니 치운 셈 칩시다.",
  },
  {
    id: "shell",
    name: "조개껍데기",
    emoji: "🐚",
    tier: "junk",
    weight: 110,
    blurb: "귀에 대면 파도 소리가… 사실 여기가 바다입니다.",
  },
  {
    id: "rock",
    name: "그냥 돌",
    emoji: "🪨",
    tier: "junk",
    weight: 100,
    blurb: "돌입니다. 정말 그냥 돌입니다.",
  },
  {
    id: "iou",
    name: "차용증",
    emoji: "📜",
    tier: "junk",
    weight: 90,
    blurb: '"커피는 네가 사라" 라고 적혀 있습니다. 주인장 필체네요.',
  },

  /**
   * ── 딱 하나 있는 진짜 ──
   * 꽝 바로 위에 이것 하나가 있다. 1.5% 남짓 — 서른 번쯤 던지면 한 번.
   */
  {
    id: "americano",
    name: "아메리카노 쿠폰",
    emoji: "☕",
    tier: "real",
    weight: 12,
    redeemable: true,
    blurb: "주인장이 진짜로 삽니다. 이 화면을 캡처해서 보내세요.",
  },
];

export const TOTAL_WEIGHT = CATCHABLES.reduce(
  (sum, item) => sum + item.weight,
  0,
);

export function catchableById(id: string): Catchable | undefined {
  return CATCHABLES.find((item) => item.id === id);
}

/**
 * 무게로 하나 고른다.
 *
 * 난수를 인자로 받는 이유는 **서버가 굴리되 테스트도 굴려봐야** 하기 때문이다.
 * Math.random 을 안에서 부르면 확률이 맞는지 검사할 방법이 없어진다.
 */
export function rollCatch(random: () => number): Catchable {
  let ticket = random() * TOTAL_WEIGHT;
  for (const item of CATCHABLES) {
    ticket -= item.weight;
    if (ticket < 0) return item;
  }
  // random() 이 1.0 을 내도 마지막 항목으로 떨어진다.
  return CATCHABLES[CATCHABLES.length - 1] as Catchable;
}

// ── 통신 계약 ────────────────────────────────────────────

export const catchRequest = z.object({
  playerId: z.string().min(8).max(64),
  room: z.string().min(1).max(32),
});
export type CatchRequest = z.infer<typeof catchRequest>;

export const catchResult = z.object({
  itemId: z.string(),
  /** 교환 코드. redeemable 이 아닌 경우엔 없다. */
  code: z.string().nullable(),
  caughtAt: z.string(),
});
export type CatchResult = z.infer<typeof catchResult>;

/** 한 시간에 이 횟수까지만 던질 수 있다. 서버가 굴리므로 여기가 유일한 방벽이다. */
export const CATCH_HOURLY_LIMIT = 30;
