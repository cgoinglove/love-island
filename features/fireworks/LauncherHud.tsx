"use client";

import { useCallback, useEffect, useRef } from "react";
import { CHUNKY, SIGN, SIGN_ACCENT } from "@/components/island/ui";
import { isTypingTarget } from "@/game/core/input/keyboard";
import { emitRoomEvent } from "@/game/net/presence";
import { t } from "@/shared/strings";
import { CHARGE_SECONDS, powerFor, targetFor } from "./constants";
import { useLauncherStore } from "./session";

/**
 * 폭죽 쏘기 조작 — 누르고 있는 만큼 차오르고, 떼면 그만큼 크게 터진다.
 *
 * ── 왜 게이지가 리액트 상태가 아닌가 ──
 * 차오르는 정도는 초당 60번 바뀌는 값이다. 상태로 두면 게이지 하나 때문에
 * HUD 가 초당 60번 리렌더된다 — 캐릭터 좌표를 ref 로 두는 것과 같은 이유로,
 * 여기서도 DOM 을 직접 만진다.
 */
export function LauncherHud() {
  const active = useLauncherStore((state) => state.active);
  const leave = useLauncherStore((state) => state.leave);

  const fillRef = useRef<HTMLDivElement>(null);
  /** 누르기 시작한 시각. null 이면 안 누르고 있다. */
  const heldSince = useRef<number | null>(null);
  const frame = useRef(0);

  const paint = useCallback(() => {
    const started = heldSince.current;
    const fill = fillRef.current;
    if (started !== null && fill) {
      const held = (performance.now() - started) / 1000;
      const ratio = Math.min(1, held / CHARGE_SECONDS);
      fill.style.width = `${ratio * 100}%`;
      frame.current = requestAnimationFrame(paint);
    }
  }, []);

  const press = useCallback(() => {
    if (heldSince.current !== null) return;
    heldSince.current = performance.now();
    frame.current = requestAnimationFrame(paint);
  }, [paint]);

  const release = useCallback(() => {
    const started = heldSince.current;
    if (started === null) return;
    heldSince.current = null;
    cancelAnimationFrame(frame.current);
    const fill = fillRef.current;
    if (fill) fill.style.width = "0%";

    /**
     * 사건 하나만 뿌린다. 규모와 **터질 자리**를 함께 실어 보내므로,
     * 모두가 같은 자리에서 같은 크기로 터지는 걸 본다 — 내 화면에서도
     * 남의 화면에서도 같은 경로를 지나므로 어긋날 여지가 없다.
     */
    const power = powerFor((performance.now() - started) / 1000);
    const [x, z] = targetFor(power, Math.random);
    emitRoomEvent(
      "shell",
      `${power.toFixed(2)},${x.toFixed(1)},${z.toFixed(1)}`,
    );
  }, []);

  // 스페이스를 누르고 있으면 차오른다. 손가락과 같은 규칙.
  useEffect(() => {
    if (!active) return;
    const onDown = (event: KeyboardEvent) => {
      if (isTypingTarget(event) || event.repeat) return;
      if (event.key === "Escape") {
        leave();
        return;
      }
      if (event.key !== " " && event.key !== "Enter") return;
      event.preventDefault();
      event.stopPropagation();
      press();
    };
    const onUp = (event: KeyboardEvent) => {
      if (event.key !== " " && event.key !== "Enter") return;
      event.preventDefault();
      release();
    };
    window.addEventListener("keydown", onDown, true);
    window.addEventListener("keyup", onUp, true);
    return () => {
      window.removeEventListener("keydown", onDown, true);
      window.removeEventListener("keyup", onUp, true);
    };
  }, [active, press, release, leave]);

  // 떠날 때 손가락이 눌린 채로 남아 있으면 게이지가 영영 돈다.
  useEffect(() => {
    if (!active) {
      heldSince.current = null;
      cancelAnimationFrame(frame.current);
    }
  }, [active]);

  if (!active) return null;

  return (
    <div className="-translate-x-1/2 pointer-events-none fixed bottom-24 left-1/2 z-20 flex flex-col items-center gap-2">
      <p className={`${SIGN} px-4 py-1.5 font-bold text-[13px]`}>
        {t().fireworks.hint}
      </p>

      <div className="pointer-events-auto flex items-center gap-2">
        <button
          type="button"
          onPointerDown={(event) => {
            event.preventDefault();
            press();
          }}
          onPointerUp={release}
          onPointerCancel={release}
          onPointerLeave={release}
          className={`${SIGN_ACCENT} ${CHUNKY} relative w-52 overflow-hidden px-7 py-3 font-black text-[15px] touch-none select-none`}
        >
          {/* 차오르는 띠. 글자 뒤에서 왼쪽부터 찬다. */}
          <span
            ref={fillRef}
            className="absolute inset-y-0 left-0 w-0 bg-[#ffd76b]"
            style={{ transition: "none" }}
          />
          <span className="relative">{t().fireworks.charge}</span>
        </button>

        <button
          type="button"
          onClick={leave}
          className={`${SIGN} ${CHUNKY} px-3.5 py-2 font-bold text-[13px]`}
        >
          {t().fireworks.quit}
        </button>
      </div>
    </div>
  );
}
