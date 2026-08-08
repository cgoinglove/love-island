"use client";

import { create } from "zustand";
import {
  botDecision,
  CHAT_BUBBLE_MS,
  isReactionKind,
  type ReactionKind,
  type RoomEvent,
} from "@/shared/presence";

/**
 * 방 사건(채팅 · 밀치기 · 이모트)의 수신 쪽.
 *
 * 같은 사건이 P2P 와 서버 양쪽으로 오므로 **id 로 한 번 걸러낸다.**
 * 이게 없으면 채팅이 두 번씩 뜨고 밀치기가 두 배로 세진다.
 */

/** 최근에 처리한 사건 id. 오래된 것은 버린다 — 무한정 쌓이면 그것도 누수다. */
const seen = new Map<string, number>();
const SEEN_TTL_MS = 60_000;

function alreadyHandled(id: string): boolean {
  const now = Date.now();
  if (seen.has(id)) return true;

  seen.set(id, now);
  if (seen.size > 400) {
    for (const [key, at] of seen) {
      if (now - at > SEEN_TTL_MS) seen.delete(key);
    }
  }
  return false;
}

export interface Bubble {
  text: string;
  kind: "chat" | "emote";
  at: number;
}

/**
 * 말풍선만 있고 로그는 없다.
 *
 * 지나간 말을 화면에 쌓아두지 않는 게 의도다 — 여긴 채팅 앱이 아니라 섬이고,
 * 대화 기록이 화면을 먹으면 섬이 안 보인다. 남겨야 할 말은 방명록이 받는다.
 */
interface RoomEventState {
  /** playerId → 머리 위 말풍선. 몇 초 뒤 사라진다. */
  bubbles: Record<string, Bubble>;
  setBubble(playerId: string, bubble: Bubble): void;
  expireBubbles(): void;
}

export const useRoomEventStore = create<RoomEventState>()((set) => ({
  bubbles: {},
  setBubble: (playerId, bubble) =>
    set((state) => ({ bubbles: { ...state.bubbles, [playerId]: bubble } })),
  expireBubbles: () =>
    set((state) => {
      const now = Date.now();
      const next: Record<string, Bubble> = {};
      let changed = false;
      for (const [id, bubble] of Object.entries(state.bubbles)) {
        if (now - bubble.at < CHAT_BUBBLE_MS) next[id] = bubble;
        else changed = true;
      }
      return changed ? { bubbles: next } : state;
    }),
}));

/**
 * 밀치기를 맞았을 때 실제로 몸을 날리는 쪽은 **맞는 사람의 클라이언트**다.
 *
 * 때린 사람이 "너 이만큼 밀렸어"라고 통보하면 남의 위치를 마음대로 옮길 수 있게 된다.
 * 각자 자기 몸에 대해서만 권위를 갖는 게 P2P 에서 유일하게 말이 되는 규칙이다.
 */
type ShoveHandler = (event: RoomEvent) => void;
const shoveHandlers = new Set<ShoveHandler>();

/**
 * 감정표현은 파티클 풀에 직접 쓴다 — zustand 를 거치지 않는다.
 *
 * 상태로 두면 버스트마다 리액트 렌더가 한 번씩 돌고, 연타하면 그게 프레임을 갉는다.
 * 파티클은 어차피 리액트가 알 필요가 없는 데이터라 구독자에게 바로 넘긴다.
 */
export interface ReactionBurst {
  kind: ReactionKind;
  x: number;
  z: number;
}

type ReactionHandler = (burst: ReactionBurst) => void;
const reactionHandlers = new Set<ReactionHandler>();

export function registerReactionHandler(handler: ReactionHandler): () => void {
  reactionHandlers.add(handler);
  return () => {
    reactionHandlers.delete(handler);
  };
}

function fireReaction(burst: ReactionBurst): void {
  for (const handler of reactionHandlers) handler(burst);
}

/**
 * 봇 사건.
 *
 * 결정(bot)은 모두가 듣고 같은 위치를 계산한다. 부탁(botAsk)은 소유자만 듣고 반응한다 —
 * 구독하는 쪽에서 자기가 소유자인지 판단하므로 여기서는 그냥 흘려보낸다.
 */
type BotHandler = (event: RoomEvent) => void;
const botHandlers = new Set<BotHandler>();

export function registerBotHandler(handler: BotHandler): () => void {
  botHandlers.add(handler);
  return () => {
    botHandlers.delete(handler);
  };
}

/** 결정 문자열이 계약에 맞는지 확인한다. 남이 보낸 값은 믿지 않는다. */
export function parseBotDecision(text: string) {
  try {
    return botDecision.safeParse(JSON.parse(text));
  } catch {
    return { success: false as const, data: undefined };
  }
}

export function registerShoveHandler(handler: ShoveHandler): () => void {
  shoveHandlers.add(handler);
  return () => {
    shoveHandlers.delete(handler);
  };
}

/** P2P 로 왔든 서버로 왔든 모든 사건은 여기 한 곳을 지난다. */
export function handleRoomEvent(event: RoomEvent, myId: string): void {
  if (event.from === myId) return;
  if (alreadyHandled(event.id)) return;

  const store = useRoomEventStore.getState();

  if (event.kind === "chat") {
    store.setBubble(event.from, {
      text: event.text,
      kind: "chat",
      at: Date.now(),
    });
    return;
  }

  if (event.kind === "emote") {
    store.setBubble(event.from, {
      text: event.text,
      kind: "emote",
      at: Date.now(),
    });
    return;
  }

  if (event.kind === "bot" || event.kind === "botAsk") {
    for (const handler of botHandlers) handler(event);
    return;
  }

  if (event.kind === "fx") {
    // 남이 보낸 종류 문자열은 믿지 않는다. 모르는 값이면 그냥 버린다.
    if (isReactionKind(event.text)) {
      fireReaction({ kind: event.text, x: event.x, z: event.z });
    }
    return;
  }

  for (const handler of shoveHandlers) handler(event);
}

/**
 * 내가 보낸 사건을 로컬에 먼저 반영한다. 왕복을 기다리면 내 채팅이 늦게 뜬다.
 *
 * ⚠ 내 말풍선도 남의 것과 **같은 store 같은 키 공간**에 들어간다.
 *   LocalPlayer 가 자기 id 로 구독해서 그린다 — 예전엔 여기에 쓰기만 하고
 *   읽는 곳이 RemotePlayers 뿐이라, 내가 친 채팅은 남에게만 보이고
 *   정작 나한테는 안 보였다.
 */
export function reflectOwnEvent(
  event: Pick<RoomEvent, "kind" | "text" | "x" | "z">,
  myId: string,
): void {
  if (event.kind === "bot" || event.kind === "botAsk") {
    /**
     * 봇 사건은 내가 낸 것도 나에게 적용돼야 한다.
     * 소유자는 자기 결정을 스스로 반영해야 하고, 소유자가 자기한테 부탁하는 경우도 있다.
     * 왕복을 기다리면 내 화면에서만 봇이 늦게 움직인다.
     */
    for (const handler of botHandlers) {
      handler({ ...event, from: myId, id: "", nickname: null, yaw: 0, seq: 0 });
    }
    return;
  }

  if (event.kind === "chat" || event.kind === "emote") {
    useRoomEventStore.getState().setBubble(myId, {
      text: event.text,
      kind: event.kind,
      at: Date.now(),
    });
    return;
  }

  if (event.kind === "fx" && isReactionKind(event.text)) {
    fireReaction({ kind: event.text, x: event.x, z: event.z });
  }
}
