"use client";

import { useEffect, useRef } from "react";
import { CHUNKY, SIGN } from "@/components/island/ui";
import { isTypingTarget } from "@/game/core/input/keyboard";
import { usePlayerController } from "@/game/core/playerControl";
import { serverNow } from "@/game/net/serverClock";
import { t } from "@/shared/strings";
import { BALLOON_PAD } from "./constants";
import { flightAt } from "./flight";
import { useScheduleStore } from "./schedule";
import { useRideStore } from "./session";

/**
 * 타고 있는 동안의 화면.
 *
 * 남은 시간 한 줄과 뛰어내리기 하나뿐이다. 하늘에서 섬을 보라고 만든 자리에
 * 버튼을 늘어놓으면 사람들은 섬이 아니라 버튼을 본다 — 의자와 같은 원칙이다.
 */
export function RideHud() {
  const riding = useRideStore((state) => state.riding);
  const leave = useRideStore((state) => state.leave);
  const controllerRef = usePlayerController();
  const clockRef = useRef<HTMLSpanElement>(null);

  /**
   * 남은 시간은 초당 한 번만 고쳐 쓴다.
   * 상태로 두면 1초마다 리렌더가 도는데, 글자 하나 바꾸자고 낼 값이 아니다.
   */
  useEffect(() => {
    if (!riding) return;
    const tick = () => {
      const departAt = useScheduleStore.getState().departAt;
      const flight = flightAt(
        serverNow() / 1000,
        departAt === null ? null : departAt / 1000,
        BALLOON_PAD,
      );
      const node = clockRef.current;
      if (!node) return;
      node.textContent =
        flight.phase === "boarding" || flight.phase === "waiting"
          ? t().balloon.departing(Math.ceil(flight.untilDeparture))
          : t().balloon.landing(Math.ceil(flight.untilLanding));
    };
    tick();
    const timer = setInterval(tick, 250);
    return () => clearInterval(timer);
  }, [riding]);

  /**
   * 뛰어내리기.
   *
   * 26m 에서 떨어져도 다치지 않는다 — 이 섬에는 체력이 없다. 대신 바다에
   * 떨어지면 첨벙 소리와 함께 헤엄쳐 나와야 한다. 그게 벌이자 상이다.
   */
  const jump = () => {
    leave();
    controllerRef.current?.carry(null);
  };

  useEffect(() => {
    if (!riding) return;
    const onKey = (event: KeyboardEvent) => {
      if (isTypingTarget(event)) return;
      if (event.key !== "Escape") return;
      jump();
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  });

  if (!riding) return null;

  return (
    <div className="-translate-x-1/2 pointer-events-none fixed top-6 left-1/2 z-30 flex flex-col items-center gap-2">
      <span
        ref={clockRef}
        className={`${SIGN} px-4 py-1.5 font-bold text-[13px] tabular-nums`}
      />
      <button
        type="button"
        onClick={jump}
        className={`${SIGN} ${CHUNKY} pointer-events-auto px-4 py-2 font-bold text-[13px]`}
      >
        {t().balloon.jump}
      </button>
    </div>
  );
}
