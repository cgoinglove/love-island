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
  /**
   * 이름과 설명은 여기 없다 — `shared/strings.ts` 의 `fishing.catchables[id]` 에 있다.
   * 표는 확률과 규칙이고 문구는 언어를 타므로, 둘을 같이 두면 언어를 추가할 때마다
   * 확률표를 건드려야 한다. **DB 에 남는 것도 이 id 다.**
   */
  id: string;
  emoji: string;
  tier: RewardTier;
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
    emoji: "〰️",
    tier: "junk",
    weight: 150,
  },
  {
    id: "boot",
    emoji: "🥾",
    tier: "junk",
    weight: 140,
  },
  {
    id: "seaweed",
    emoji: "🌿",
    tier: "junk",
    weight: 130,
  },
  {
    id: "can",
    emoji: "🥫",
    tier: "junk",
    weight: 120,
  },
  {
    id: "shell",
    emoji: "🐚",
    tier: "junk",
    weight: 110,
  },
  {
    id: "rock",
    emoji: "🪨",
    tier: "junk",
    weight: 100,
  },
  {
    id: "iou",
    emoji: "📜",
    tier: "junk",
    weight: 90,
  },

  /**
   * ── 딱 하나 있는 진짜 ──
   * 꽝 바로 위에 이것 하나가 있다. 1.5% 남짓 — 서른 번쯤 던지면 한 번.
   */
  {
    id: "americano",
    emoji: "☕",
    tier: "real",
    weight: 12,
    redeemable: true,
  },
];

export const TOTAL_WEIGHT = CATCHABLES.reduce(
  (sum, item) => sum + item.weight,
  0,
);

/**
 * 진짜 보상이 나올 확률(%).
 *
 * 화면에 "1.4% 확률로 커피가 나옵니다" 라고 적어주려고 **표에서 계산한다.**
 * 손으로 적어두면 무게를 만지는 순간 화면이 거짓말을 시작하는데, 그 거짓말은
 * 아무도 못 알아챈다 — 확률은 눈으로 검산할 수 있는 종류의 값이 아니다.
 */
export const REAL_CHANCE_PERCENT =
  (CATCHABLES.filter((item) => item.tier === "real").reduce(
    (sum, item) => sum + item.weight,
    0,
  ) /
    TOTAL_WEIGHT) *
  100;

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
