import { t } from "@/shared/strings";
import type { Vec2XZ } from "@/shared/types";

/**
 * 안내 봇의 대본.
 *
 * ── 왜 데이터로 두나 ──
 * 봇이 할 줄 아는 일을 늘릴 때마다 상태 기계를 고치게 되면 금방 손댈 수 없어진다.
 * 여기 배열에 한 줄 더하는 것만으로 새 안내가 생기게 해두면, 나중에 낚시터가
 * 생기든 미니게임이 생기든 대본만 늘리면 된다.
 *
 * ── 왜 대사가 여기 없나 ──
 * 여기 있는 건 **누가 어디로 데려가나** 뿐이고, 실제 말은 `shared/strings.ts` 에서
 * 꺼내 온다. 언어가 둘이라 대사를 여기 박아두면 topic 마다 언어 분기가 생긴다.
 * id 만 남기면 언어가 늘어도 이 파일은 그대로다.
 *
 * ── 왜 game/core 인가 ──
 * 봇의 판단은 three 도 리액트도 모르는 순수 로직이다. 순수하면 테스트할 수 있고,
 * 테스트할 수 있으면 "봇이 이상한 데로 간다" 같은 버그를 눈이 아니라 코드로 잡는다.
 */

/** 대본에 있는 화제. 말은 언어별 사전에서 같은 id 로 찾는다. */
export type TopicId = keyof ReturnType<typeof t>["bot"]["topics"];

export interface BotTopic {
  id: TopicId;
  /**
   * 데려갈 자리. 없으면 제자리에서 말만 한다.
   * 봇은 여기까지 걸어가고, 말은 걷는 동안에도 이어진다.
   */
  guideTo?: Vec2XZ;
}

/**
 * 봇이 아는 것들.
 *
 * 좌표는 각 feature 의 접근점(constants.ts 의 *_APPROACH)과 같은 자리를 쓴다 —
 * 봇이 데려다 준 자리에서 바로 E 를 누를 수 있어야 안내가 완결된다.
 */
export const BOT_TOPICS: readonly BotTopic[] = [
  { id: "controls" },
  { id: "career", guideTo: [-11.8, 16.6] },
  { id: "album", guideTo: [11.8, 16.6] },
  { id: "fishing", guideTo: [-5.6, 48.5] },
  { id: "guestbook", guideTo: [0, 11.5] },
];

export function topicById(id: string): BotTopic | undefined {
  return BOT_TOPICS.find((topic) => topic.id === id);
}

/** 말풍선 버튼에 뜨는 짧은 이름. */
export function labelOf(id: TopicId): string {
  return t().bot.topics[id].label;
}

/**
 * 키 하나로 대사를 찾는다.
 *
 * ── 왜 대사를 안 보내나 ──
 * 봇 결정을 사건 채널로 보낼 때 대사를 통째로 실었더니 250자가 넘어 계약 상한에
 * 걸렸다. 그런데 **대사는 모두가 이미 갖고 있다** — 같은 번들을 받았으니까.
 * 이미 가진 걸 다시 보내는 건 낭비고, 상한을 올리는 건 그 낭비를 감추는 것이다.
 * 키만 보내면 결정 하나가 100자 남짓으로 줄고, 대사를 길게 써도 통신량이 안 는다.
 *
 * ⚠ 언어가 다른 사람끼리도 같은 키가 오간다. 그래서 한국어로 보는 사람과 영어로
 *   보는 사람이 **각자 자기 언어로** 같은 말을 듣는다 — 키를 보내는 설계의 덤이다.
 */
export function linesFor(key: string | null): readonly string[] {
  if (!key) return [];
  const topic = topicById(key);
  return topic ? t().bot.topics[topic.id].lines : [];
}
