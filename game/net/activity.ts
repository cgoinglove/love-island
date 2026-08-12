"use client";

import { useEffect } from "react";
import { create } from "zustand";
import { emitRoomEvent, getMyPlayerId } from "@/game/net/presence";
import { registerActivityHandler } from "@/game/net/roomEvents";
import {
  ACTIVITY_BEAT_MS,
  ACTIVITY_TTL_MS,
  type ActivityKind,
  isActivityKind,
} from "@/shared/presence";

/**
 * 누가 지금 뭘 하고 있는가 — 낚시 중인가, 앉아 있는가.
 *
 * ── 이게 없으면 ──
 * 낚시는 **내 화면에서만** 벌어졌다. 옆 사람이 물가에 서서 찌를 던지고 있어도
 * 나에게는 그냥 서 있는 사람이었다. 혼자 하는 게임이면 상관없지만, 이 섬은
 * 남이 보인다는 게 거의 전부인 곳이다 — 남이 뭘 하는지 안 보이면 같이 있을
 * 이유가 없다.
 *
 * ── 되풀이해 보낸다 ──
 * 사건은 한 번 지나가면 끝이라, 내가 낚시를 시작한 **뒤에** 들어온 사람은
 * 영영 모른다. 그래서 하는 동안 몇 초에 한 번씩 같은 말을 다시 한다.
 * 덕분에 그만두는 신호를 놓쳐도 TTL 이 지나면 저절로 정리된다 —
 * 탭을 그냥 닫은 사람의 낚싯대가 영원히 남지 않는다.
 */

interface Doing {
  kind: ActivityKind;
  /** 마지막으로 소식을 들은 시각(로컬 시계 ms). TTL 판정에만 쓴다. */
  at: number;
}

interface ActivityState {
  /** playerId → 하고 있는 일. 나 자신도 여기 들어간다. */
  doing: Record<string, Doing>;
  mark(playerId: string, kind: ActivityKind): void;
  clear(playerId: string): void;
  expire(): void;
}

export const useActivityStore = create<ActivityState>()((set) => ({
  doing: {},
  mark: (playerId, kind) =>
    set((state) => {
      const previous = state.doing[playerId];
      // 같은 일을 계속하고 있다는 소식이면 시각만 갱신한다 —
      // 새 객체를 만들면 구독자가 매 박자 리렌더된다.
      if (previous?.kind === kind) {
        previous.at = Date.now();
        return state;
      }
      return {
        doing: { ...state.doing, [playerId]: { kind, at: Date.now() } },
      };
    }),
  clear: (playerId) =>
    set((state) => {
      if (!state.doing[playerId]) return state;
      const next = { ...state.doing };
      delete next[playerId];
      return { doing: next };
    }),
  expire: () =>
    set((state) => {
      const now = Date.now();
      let changed = false;
      const next: Record<string, Doing> = {};
      for (const [id, entry] of Object.entries(state.doing)) {
        if (now - entry.at < ACTIVITY_TTL_MS) next[id] = entry;
        else changed = true;
      }
      return changed ? { doing: next } : state;
    }),
}));

/**
 * 내가 하고 있는 일을 알린다. null 이면 그만뒀다는 뜻이다.
 *
 * 내 것도 같은 store 에 넣는다. 읽는 쪽(리모트 렌더링)이 "나만 예외" 를
 * 신경 쓸 필요가 없어지고, 내 낚싯대를 그리는 코드와 남의 낚싯대를 그리는
 * 코드가 하나로 남는다.
 */
export function setMyActivity(kind: ActivityKind | null): void {
  const me = getMyPlayerId();
  const store = useActivityStore.getState();
  if (kind === null) {
    store.clear(me);
    emitRoomEvent("act", "");
    return;
  }
  store.mark(me, kind);
  emitRoomEvent("act", kind);
}

/**
 * 하고 있는 동안 계속 알린다.
 *
 * feature 가 "지금 낚시 중" 이라는 사실 하나만 넘기면 시작 · 되풀이 · 끝맺음이
 * 전부 여기서 처리된다. 언마운트될 때도 그만뒀다고 알린다 —
 * 이게 없으면 페이지를 옮긴 사람의 낚싯대가 TTL 만큼 남는다.
 */
export function useBroadcastActivity(
  kind: ActivityKind,
  active: boolean,
): void {
  useEffect(() => {
    if (!active) return;
    setMyActivity(kind);
    const timer = setInterval(() => setMyActivity(kind), ACTIVITY_BEAT_MS);
    return () => {
      clearInterval(timer);
      setMyActivity(null);
    };
  }, [kind, active]);
}

/**
 * 남들의 소식을 받아 store 에 넣고, 소식이 끊긴 사람을 치운다.
 *
 * 앱에 한 번만 붙인다(GameCanvas). feature 마다 붙이면 같은 사건을 여러 번
 * 처리하게 되는데, 그건 틀리진 않아도 낭비다.
 */
export function useActivityFeed(): void {
  useEffect(() => {
    const off = registerActivityHandler((event) => {
      const store = useActivityStore.getState();
      if (isActivityKind(event.text)) store.mark(event.from, event.text);
      else store.clear(event.from);
    });
    // 초당 두 번이면 충분하다. TTL 이 8초라 이보다 자주 볼 이유가 없다.
    const timer = setInterval(() => useActivityStore.getState().expire(), 500);
    return () => {
      off();
      clearInterval(timer);
    };
  }, []);
}

/** 이 사람이 지금 하고 있는 일. 아무것도 안 하면 null. */
export function useDoing(playerId: string): ActivityKind | null {
  return useActivityStore((state) => state.doing[playerId]?.kind ?? null);
}

/**
 * 내가 지금 앉아 있는가.
 *
 * HUD 가 이걸 물어보는 이유는, 앉으면 화면이 **조작하는 화면에서 보는 화면**으로
 * 바뀌기 때문이다. 조이스틱과 버튼이 검은 띠 뒤에 반쯤 걸쳐 남아 있으면
 * 그 전환이 흐려진다. 앉기는 features 의 기능이지만 이 사실은 이미 네트워크를
 * 타고 다니므로, HUD 가 컨텐츠를 몰라도 물어볼 수 있다.
 */
export function useAmSitting(): boolean {
  const me = getMyPlayerId();
  return useActivityStore((state) => state.doing[me]?.kind === "sitting");
}
