"use client";

import { useEffect } from "react";
import { create } from "zustand";
import { emitRoomEvent } from "@/game/net/presence";
import { registerRideHandler } from "@/game/net/roomEvents";
import { serverNow } from "@/game/net/serverClock";
import { parseDepartAt } from "@/shared/presence";
import { BOARDING_GRACE, RIDE_SECONDS } from "./flight";

/**
 * 열기구가 언제 떠나는가 — 방 전체가 공유하는 숫자 **하나**.
 *
 * ── 왜 이 하나면 되나 ──
 * 기구의 자리·고도·구간은 전부 출발 시각에서 유도된다(flight.ts). 그래서
 * 좌표도 고도도 보낼 필요가 없고, 탄 사람의 위치는 원래 보내던 좌표 패킷에
 * 실려 나간다. **같이 타는 데 드는 통신이 숫자 한 개다.**
 *
 * ── 왜 되풀이해 보내나 ──
 * 사건은 한 번 지나가면 끝이라, 기구가 뜬 **뒤에** 들어온 사람은 그게 하늘에
 * 있다는 걸 모른다. 타고 있는 사람이 몇 초에 한 번 같은 숫자를 다시 알리면
 * 늦게 온 사람도 한 박자면 따라잡는다 — 낚시·앉기와 같은 방식이다.
 */

/** 타고 있는 동안 출발 시각을 되풀이해 알리는 주기(ms). */
const BEACON_MS = 3000;

interface ScheduleState {
  /** 출발 시각(공유 시계 epoch ms). null 이면 계류장에서 손님을 기다린다. */
  departAt: number | null;
  set(at: number | null): void;
}

export const useScheduleStore = create<ScheduleState>()((set) => ({
  departAt: null,
  set: (departAt) => set({ departAt }),
}));

/**
 * 기구를 부른다. 이미 예정돼 있으면 그 편에 얹혀 탄다.
 *
 * 출발 시각을 정하는 건 **먼저 탄 사람**이다. 아무도 책임지지 않는 시간표보다
 * 이쪽이 낫다 — 빈 섬에서 기구가 혼자 뜨고 내리지 않고, 걸어온 사람이
 * 40초를 기다리지도 않는다.
 */
export function callBalloon(): void {
  const store = useScheduleStore.getState();
  if (store.departAt !== null) return;

  const at = serverNow() + BOARDING_GRACE * 1000;
  store.set(at);
  emitRoomEvent("ride", String(Math.round(at)));
}

/** 지금 하늘에 떠 있는 편을 다시 알린다. 늦게 들어온 사람을 위해서다. */
function beacon(): void {
  const { departAt } = useScheduleStore.getState();
  if (departAt !== null) emitRoomEvent("ride", String(Math.round(departAt)));
}

/**
 * 남이 부른 기구를 받아 적고, 한 편이 끝나면 지운다.
 *
 * 앱에 한 번만 붙인다. 지우는 걸 각자 하는 게 요점이다 — 착륙을 알리는 사건이
 * 따로 없어도, 출발 시각만 알면 언제 끝나는지 모두가 스스로 안다.
 */
export function useBalloonSchedule(riding: boolean): void {
  useEffect(() => {
    const off = registerRideHandler((event) => {
      const at = parseDepartAt(event.text, serverNow());
      if (at === null) return;
      const current = useScheduleStore.getState().departAt;
      /**
       * 둘이 거의 동시에 부르면 **먼저 정해진 쪽**을 따른다.
       * 나중 것을 받으면 이미 뜬 기구가 땅으로 되돌아간다.
       */
      if (current === null || at < current) useScheduleStore.getState().set(at);
    });

    const timer = setInterval(() => {
      const { departAt, set } = useScheduleStore.getState();
      if (departAt === null) return;
      if (serverNow() - departAt >= RIDE_SECONDS * 1000) set(null);
    }, 500);

    return () => {
      off();
      clearInterval(timer);
    };
  }, []);

  // 타고 있는 동안에만 되풀이해 알린다. 모두가 알리면 사건이 인원수만큼 는다.
  useEffect(() => {
    if (!riding) return;
    const timer = setInterval(beacon, BEACON_MS);
    return () => clearInterval(timer);
  }, [riding]);
}
