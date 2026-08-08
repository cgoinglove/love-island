"use client";

import { useRef } from "react";
import { CHUNKY } from "@/components/island/ui";
import { usePlayerController } from "@/game/core/playerControl";
import { useHudStore } from "./store";
import { useTouchMode } from "./touch";

/**
 * 모바일 조작. 왼쪽 조이스틱 + 오른쪽 점프·밀치기 버튼.
 *
 * 데스크톱에서는 숨긴다 — 키보드가 있는데 화면을 가릴 이유가 없다.
 * 판정은 `useTouchMode` 가 한다(game/hud/touch.ts) — 기기 능력이 아니라
 * **실제로 터치가 들어왔는가**를 본다.
 *
 * ── 화면 아래를 나눠 쓴다 ──
 * 조이스틱이 왼쪽 아래, 액션 버튼이 오른쪽 아래를 차지한다. 그래서 채팅 독은
 * 그 사이와 위쪽으로 비켜 앉는다(ChatComposer). 서로 자리를 아는 건
 * `useTouchMode` 와 `chatOpen` 두 값 덕분이다.
 */
export function TouchControls() {
  const controllerRef = usePlayerController();
  const touch = useTouchMode();
  const chatOpen = useHudStore((state) => state.chatOpen);

  // 글을 쓰는 동안엔 걸어다닐 일이 없고, 소프트 키보드가 이 자리를 가져간다.
  if (!touch || chatOpen) return null;

  return (
    <>
      <Joystick />
      <div className="fixed right-5 bottom-8 z-20 flex flex-col items-center gap-3">
        <ActionButton
          label="밀기"
          className="bg-rose-500/90"
          onPress={() => controllerRef.current?.shove()}
        />
        <ActionButton
          label="점프"
          className="bg-sky-500/90"
          onPress={() => controllerRef.current?.setVirtualJump(true)}
          onRelease={() => controllerRef.current?.setVirtualJump(false)}
        />
      </div>
    </>
  );
}

function ActionButton({
  label,
  className,
  onPress,
  onRelease,
}: {
  label: string;
  className: string;
  onPress(): void;
  onRelease?(): void;
}) {
  return (
    <button
      type="button"
      onPointerDown={(event) => {
        event.preventDefault();
        onPress();
      }}
      onPointerUp={() => onRelease?.()}
      onPointerCancel={() => onRelease?.()}
      onPointerLeave={() => onRelease?.()}
      className={`size-16 touch-none rounded-full font-bold text-[14px] ring-2 ring-[#4a3428] ${CHUNKY} ${className}`}
    >
      {label}
    </button>
  );
}

/** 조이스틱 반지름(px). 이 거리에서 축이 1.0 이 된다. */
const RADIUS = 46;

function Joystick() {
  const controllerRef = usePlayerController();
  const baseRef = useRef<HTMLDivElement>(null);
  const knobRef = useRef<HTMLDivElement>(null);
  const originRef = useRef<{ x: number; y: number } | null>(null);

  /**
   * 손가락 위치를 state 로 관리하지 않는다 — 드래그하는 동안 초당 60번 리렌더가 돈다.
   * 노브는 ref 로 직접 transform 을 쓰고, 축은 컨트롤러로 밀어 넣는다. (기획서 §4.1)
   */
  function moveKnob(dx: number, dy: number) {
    const distance = Math.hypot(dx, dy);
    const scale = distance > RADIUS ? RADIUS / distance : 1;
    const knobX = dx * scale;
    const knobY = dy * scale;

    const knob = knobRef.current;
    if (knob) knob.style.transform = `translate(${knobX}px, ${knobY}px)`;

    // 화면의 위쪽(-Y)이 월드의 북쪽(-Z)이다.
    controllerRef.current?.setVirtualAxis(knobX / RADIUS, knobY / RADIUS);
  }

  function reset() {
    originRef.current = null;
    const knob = knobRef.current;
    if (knob) knob.style.transform = "translate(0px, 0px)";
    controllerRef.current?.setVirtualAxis(0, 0);
    controllerRef.current?.setVirtualSprint(false);
  }

  return (
    <div
      ref={baseRef}
      className="fixed bottom-8 left-5 z-20 size-32 touch-none select-none rounded-full bg-[#fdf6e8]/60 ring-[3px] ring-[#4a3428]/70"
      onPointerDown={(event) => {
        event.currentTarget.setPointerCapture(event.pointerId);
        const rect = event.currentTarget.getBoundingClientRect();
        originRef.current = {
          x: rect.left + rect.width / 2,
          y: rect.top + rect.height / 2,
        };
        moveKnob(
          event.clientX - originRef.current.x,
          event.clientY - originRef.current.y,
        );
      }}
      onPointerMove={(event) => {
        const origin = originRef.current;
        if (!origin) return;
        const dx = event.clientX - origin.x;
        const dy = event.clientY - origin.y;
        moveKnob(dx, dy);
        // 끝까지 밀면 달린다. 별도 버튼 없이 스틱 하나로 걷기/달리기를 다 낸다.
        controllerRef.current?.setVirtualSprint(
          Math.hypot(dx, dy) > RADIUS * 0.92,
        );
      }}
      onPointerUp={reset}
      onPointerCancel={reset}
    >
      <div className="grid size-full place-items-center">
        <div
          ref={knobRef}
          className="size-14 rounded-full bg-white/85 shadow-md ring-1 ring-black/5"
        />
      </div>
    </div>
  );
}
