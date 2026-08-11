"use client";

import { useRef } from "react";
import { CHUNKY } from "@/components/island/ui";
import { usePlayerController } from "@/game/core/playerControl";
import { t } from "@/shared/strings";
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
          label={t().hud.touchShove}
          className="bg-rose-500/90"
          onPress={() => controllerRef.current?.shove()}
        />
        <ActionButton
          label={t().hud.touchJump}
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

/**
 * 여기까지 밀면 달린다(px).
 *
 * ⚠ 예전엔 `RADIUS * 0.92` 였다. 노브는 RADIUS 에서 멈추므로 **테두리까지 미는
 *   자연스러운 동작이 곧 달리기**였고, 폰에서는 사실상 늘 달리고 있었다
 *   (걷기 10m/s 의 세 배 = 30m/s. 섬을 3초에 가로지른다).
 *   데스크톱에서 Shift 를 일부러 누르는 것과 견줄 만한 **의도**가 필요하다.
 *
 * 링을 넘어 더 밀어야 달린다. 노브는 링에서 멈추지만 손가락은 더 갈 수 있고,
 * 그때 링이 주황으로 물들어 무슨 일이 일어났는지 알려준다.
 */
const SPRINT_DISTANCE = RADIUS * 1.7;

function Joystick() {
  const controllerRef = usePlayerController();
  const baseRef = useRef<HTMLDivElement>(null);
  const knobRef = useRef<HTMLDivElement>(null);
  const originRef = useRef<{ x: number; y: number } | null>(null);
  /** 달리는 중인가. 링 색으로만 쓰이므로 state 가 아니라 클래스를 직접 만진다. */
  const sprintingRef = useRef(false);

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
    // 축의 **길이가 세기**다 — 살짝 밀면 살살 걷는다(game/player/simulation.ts).
    controllerRef.current?.setVirtualAxis(knobX / RADIUS, knobY / RADIUS);

    // 링을 넘어 더 밀면 달린다. 링이 물들어 그걸 알려준다.
    const sprinting = distance > SPRINT_DISTANCE;
    if (sprinting !== sprintingRef.current) {
      sprintingRef.current = sprinting;
      controllerRef.current?.setVirtualSprint(sprinting);
      baseRef.current?.classList.toggle("ring-[#e8734a]", sprinting);
      baseRef.current?.classList.toggle("ring-[#4a3428]/70", !sprinting);
    }
  }

  function reset() {
    originRef.current = null;
    const knob = knobRef.current;
    if (knob) knob.style.transform = "translate(0px, 0px)";
    controllerRef.current?.setVirtualAxis(0, 0);
    controllerRef.current?.setVirtualSprint(false);
    sprintingRef.current = false;
    baseRef.current?.classList.remove("ring-[#e8734a]");
    baseRef.current?.classList.add("ring-[#4a3428]/70");
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
        moveKnob(event.clientX - origin.x, event.clientY - origin.y);
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
