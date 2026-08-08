/**
 * 캐릭터 외형 뽑기.
 *
 * ── 왜 id 에서 뽑나 ──
 * 색만 다른 곰 하나로 전부 돌리다 보니 섬에 사람이 셋 있어도 같은 인형 셋으로 보였다.
 * 그렇다고 매번 무작위로 굴리면 새로고침할 때마다 남이 다른 사람이 되어 버린다.
 *
 * playerId 를 해시해서 뽑으면 **그 사람은 언제 봐도 그 모습**이고, 서버에 외형을
 * 따로 저장할 필요도 없다. 아무도 관리하지 않아도 알아서 일관된다.
 */

export type EarStyle = "round" | "tall" | "flop" | "none";
export type Accessory = "none" | "leaf" | "cap" | "bow";

export interface CharacterLook {
  bodyColor: string;
  headColor: string;
  noseColor: string;
  earStyle: EarStyle;
  /** 머리 반지름 배수. 큰 머리와 작은 머리는 실루엣부터 다르다. */
  headScale: number;
  /** 몸통 길이 배수. 길쭉한 몸과 통통한 몸. */
  bodyScale: number;
  accessory: Accessory;
  accessoryColor: string;
  /**
   * 팔이 위아래로 흔들리는 속도(rad/s).
   *
   * 사람마다 다르다. 다 같은 속도로 흔들면 인형 여럿이 같은 태엽으로 도는 것처럼
   * 보이는데, 속도만 어긋내도 각자 다른 존재로 읽힌다.
   */
  armSpeed: number;
  /**
   * 팔 색.
   *
   * 머리색(몸통보다 6% 밝음)을 그대로 썼더니 팔이 몸통에 묻혀 안 보였다.
   * 팔은 몸통 옆에 붙어 있어서, 실루엣을 깨려면 훨씬 큰 차이가 필요하다.
   */
  armColor: string;
}

/**
 * 몸통 색.
 *
 * 채도를 낮고 밝게 유지한다 — 잔디와 바다가 이미 진한 화면이라, 캐릭터까지
 * 원색이면 서로 싸운다. 파스텔이 배경에서 떠오르면서도 튀지 않는다.
 */
const BODY_COLORS = [
  "#f7f1e3",
  "#f6d7c4",
  "#e8c9a0",
  "#cfe3d4",
  "#c9dcea",
  "#e6d4ea",
  "#f2c9c9",
  "#d9d3c4",
  "#bfd8c8",
  "#f0e0b8",
];

const NOSE_COLORS = ["#e8734a", "#d9744f", "#c2563a", "#3a2a22", "#8a5a3c"];

const EAR_STYLES: readonly EarStyle[] = ["round", "tall", "flop", "none"];

const ACCESSORY_COLORS = [
  "#5e9c55",
  "#e8734a",
  "#f0b83c",
  "#7fb3d8",
  "#c47ab8",
];

/** FNV-1a. 짧은 문자열에 충분하고, 어디서 돌려도 같은 값이 나온다. */
function hashOf(id: string): number {
  let hash = 2166136261;
  for (let i = 0; i < id.length; i += 1) {
    hash ^= id.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return Math.abs(hash);
}

/**
 * 해시 한 값에서 서로 독립적인 선택을 여러 번 뽑는다.
 *
 * 같은 해시를 여러 자리에서 나눠 쓰면 선택끼리 상관이 생긴다 —
 * 예를 들어 귀가 뾰족한 사람은 항상 같은 색이 되는 식이다.
 * 자리마다 다른 소수를 섞어서 흩뿌린다.
 */
function pickIndex(hash: number, salt: number, length: number): number {
  const mixed = Math.imul(hash ^ Math.imul(salt, 0x9e3779b1), 0x85ebca6b);
  return Math.abs(mixed >>> 3) % length;
}

/** 0~1 사이 값. 크기처럼 연속적인 값에 쓴다. */
function pickUnit(hash: number, salt: number): number {
  const mixed = Math.imul(hash ^ Math.imul(salt, 0xc2b2ae35), 0x27d4eb2f);
  return (Math.abs(mixed >>> 8) % 1000) / 1000;
}

export function lookOf(playerId: string): CharacterLook {
  const hash = hashOf(playerId);

  const body = BODY_COLORS[pickIndex(hash, 1, BODY_COLORS.length)] ?? "#f7f1e3";
  const accessoryRoll = pickUnit(hash, 6);

  return {
    bodyColor: body,
    // 머리는 몸보다 아주 살짝 밝게. 같은 색이면 덩어리 하나로 보인다.
    headColor: lighten(body, 0.06),
    noseColor: NOSE_COLORS[pickIndex(hash, 2, NOSE_COLORS.length)] ?? "#e8734a",
    earStyle: EAR_STYLES[pickIndex(hash, 3, EAR_STYLES.length)] ?? "round",
    headScale: 0.88 + pickUnit(hash, 4) * 0.3,
    bodyScale: 0.85 + pickUnit(hash, 5) * 0.35,
    // 절반 넘게는 아무것도 안 쓴다. 다 쓰고 있으면 액세서리가 특징이 안 된다.
    accessory:
      accessoryRoll < 0.55
        ? "none"
        : accessoryRoll < 0.72
          ? "leaf"
          : accessoryRoll < 0.88
            ? "cap"
            : "bow",
    accessoryColor:
      ACCESSORY_COLORS[pickIndex(hash, 7, ACCESSORY_COLORS.length)] ??
      "#5e9c55",
    // 1.2 ~ 3.6 rad/s. 느린 쪽은 여유롭고 빠른 쪽은 신난 것처럼 보인다.
    armSpeed: 1.2 + pickUnit(hash, 8) * 2.4,
    armColor: lighten(body, 0.26),
  };
}

/** #rrggbb 를 흰색 쪽으로 섞는다. three 없이 문자열만 다룬다. */
function lighten(hex: string, amount: number): string {
  const value = Number.parseInt(hex.slice(1), 16);
  const mix = (shift: number) => {
    const channel = (value >> shift) & 0xff;
    return Math.round(channel + (255 - channel) * amount);
  };
  const r = mix(16);
  const g = mix(8);
  const b = mix(0);
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, "0")}`;
}
