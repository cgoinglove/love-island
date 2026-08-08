import type { Vec2XZ } from "@/shared/types";

/**
 * 안내 봇의 대본.
 *
 * ── 왜 데이터로 두나 ──
 * 봇이 할 줄 아는 일을 늘릴 때마다 상태 기계를 고치게 되면 금방 손댈 수 없어진다.
 * 여기 배열에 한 줄 더하는 것만으로 새 안내가 생기게 해두면, 나중에 낚시터가
 * 생기든 미니게임이 생기든 대본만 늘리면 된다.
 *
 * ── 왜 game/core 인가 ──
 * 봇의 판단은 three 도 리액트도 모르는 순수 로직이다. 순수하면 테스트할 수 있고,
 * 테스트할 수 있으면 "봇이 이상한 데로 간다" 같은 버그를 눈이 아니라 코드로 잡는다.
 */

/** 봇이 한 번에 하는 말과, 그때 데려갈 곳. */
export interface BotTopic {
  id: string;
  /** 말풍선 버튼에 뜨는 짧은 이름. */
  label: string;
  /** 차례로 뜨는 대사. 한 줄씩 몇 초간 머문다. */
  lines: readonly string[];
  /**
   * 데려갈 자리. 없으면 제자리에서 말만 한다.
   * 봇은 여기까지 걸어가고, 말은 걷는 동안에도 이어진다.
   */
  guideTo?: Vec2XZ;
  /** 이 화제를 마치면 찍히는 도장. 미션과 연결된다. */
  awards?: string;
}

/** 아무도 말을 안 걸 때 혼잣말처럼 흘리는 말. */
export const BOT_IDLE_LINES: readonly string[] = [
  "여기 앉아 있으면 파도 소리가 잘 들려요.",
  "누가 오면 말 걸어주세요. 안내는 제 일이니까요.",
  "저 야자수, 흔들면 뭔가 떨어질지도 몰라요.",
  "밤이 오면 별이 꽤 많이 보입니다.",
];

export const BOT_GREETING: readonly string[] = [
  "어서 오세요! 러브 아일랜드입니다.",
  "저는 이 섬 안내를 맡고 있어요.",
  "머리 위 버튼을 누르면 어디든 데려다 드릴게요.",
];

/**
 * 봇이 아는 것들.
 *
 * 좌표는 각 feature 의 접근점(constants.ts 의 *_APPROACH)과 같은 자리를 쓴다 —
 * 봇이 데려다 준 자리에서 바로 E 를 누를 수 있어야 안내가 완결된다.
 */
export const BOT_TOPICS: readonly BotTopic[] = [
  {
    id: "controls",
    label: "조작법 알려줘",
    lines: [
      "바닥을 탭하면 그리로 걸어갑니다. WASD 도 됩니다.",
      "Shift 로 달리고, Space 로 뜁니다.",
      "가까이 가면 E 로 만질 수 있어요.",
      "1·2·3 은 하트·폭죽·축포입니다. 눌러보세요.",
    ],
    awards: "greeted",
  },
  {
    id: "career",
    label: "이 섬 주인은?",
    lines: [
      "저 책상이 주인장 자리예요. 따라오세요.",
      "노트북을 열어보면 뭘 해왔는지 나옵니다.",
    ],
    guideTo: [-11.8, 16.6],
    awards: "visited-career",
  },
  {
    id: "album",
    label: "사진첩 보고 싶어",
    lines: [
      "사진은 저쪽 빨랫줄에 걸어뒀어요.",
      "도장 세 개를 모으면 열립니다. 왼쪽 위에 목록이 있어요.",
    ],
    guideTo: [11.8, 16.6],
  },
  {
    id: "fishing",
    label: "낚시 얘기 좀",
    lines: [
      "섬 남쪽 끝 물가에 낚시터가 있어요. 데려다 드릴게요.",
      "가끔 진짜 커피 쿠폰이 걸립니다. 주인장이 진짜로 사줘요.",
      "물론 대부분은 꽝이고요. 세상이 그렇죠.",
    ],
    guideTo: [-3.3, 34.1],
    awards: "heard-fishing",
  },
  {
    id: "guestbook",
    label: "방명록은 어디?",
    lines: [
      "게시판은 섬 한가운데 있어요. 남의 쪽지는 그냥 볼 수 있고요.",
      "쪽지를 붙이려면 도장 세 개가 필요합니다.",
    ],
    guideTo: [0, 11.5],
  },
];

export function topicById(id: string): BotTopic | undefined {
  return BOT_TOPICS.find((topic) => topic.id === id);
}

/** 인사와 혼잣말도 키를 갖는다. 그래야 대사를 안 보내고 키만 보낼 수 있다. */
export const GREETING_KEY = "greeting";
export const IDLE_PREFIX = "idle:";

/**
 * 키 하나로 대사를 찾는다.
 *
 * ── 왜 대사를 안 보내나 ──
 * 봇 결정을 사건 채널로 보낼 때 대사를 통째로 실었더니 250자가 넘어 계약 상한에
 * 걸렸다. 그런데 **대사는 모두가 이미 갖고 있다** — 같은 번들을 받았으니까.
 * 이미 가진 걸 다시 보내는 건 낭비고, 상한을 올리는 건 그 낭비를 감추는 것이다.
 * 키만 보내면 결정 하나가 100자 남짓으로 줄고, 대사를 길게 써도 통신량이 안 는다.
 */
export function linesFor(key: string | null): readonly string[] {
  if (!key) return [];
  if (key === GREETING_KEY) return BOT_GREETING;
  if (key.startsWith(IDLE_PREFIX)) {
    const index = Number(key.slice(IDLE_PREFIX.length));
    const line = BOT_IDLE_LINES[index];
    return line ? [line] : [];
  }
  return topicById(key)?.lines ?? [];
}
