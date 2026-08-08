"use client";

import { Html } from "@react-three/drei";
import type { Bubble } from "@/game/net/roomEvents";

/**
 * 머리 위 말풍선과 이름표.
 *
 * 내 캐릭터와 남의 캐릭터가 **같은 컴포넌트**를 쓴다. 예전엔 RemotePlayers 만
 * 말풍선을 그렸고, 그래서 내가 친 채팅은 남한테만 보이고 나한테는 안 보였다.
 * 한 곳에 모아두면 그 종류의 어긋남이 다시 생길 수 없다.
 */
export interface SpeechBubbleProps {
  y: number;
  nickname: string | null | undefined;
  bubble: Bubble | undefined;
  /**
   * 내 캐릭터인가.
   *
   * 내 머리 위에는 이름표를 안 단다 — 어느 게 나인지는 조작해보면 바로 알고,
   * 항상 떠 있는 이름표는 시야만 가린다. 말풍선은 그대로 뜬다.
   */
  isSelf?: boolean;
}

export function SpeechBubble({
  y,
  nickname,
  bubble,
  isSelf = false,
}: SpeechBubbleProps) {
  return (
    <Html
      position={[0, y, 0]}
      center
      // 캐릭터 뒤로 넘어가도 이름은 계속 보이게 둔다. 누가 어디 있는지가 더 중요하다.
      zIndexRange={[8, 0]}
      style={{ pointerEvents: "none", userSelect: "none" }}
    >
      <div className="flex flex-col items-center gap-1">
        {bubble && (
          <div
            className={
              bubble.kind === "emote"
                ? "zoom-in animate-in text-3xl drop-shadow-lg"
                : // 테두리도 꼬리도 없다. w-max 가 없으면 Html 컨테이너 폭이 0 이라
                  // break-words 가 글자 하나마다 줄을 바꿔 말풍선이 세로로 늘어선다.
                  "zoom-in w-max max-w-[240px] animate-in whitespace-pre-wrap break-words rounded-2xl bg-[#fdf6e8] px-3.5 py-2 font-medium text-[14px] text-[#3a2a22] leading-snug shadow-[0_4px_12px_-3px_rgba(0,0,0,0.4)]"
            }
          >
            {bubble.text}
          </div>
        )}
        {!isSelf && (
          <span className="whitespace-nowrap rounded-full bg-[#4a3428] px-2.5 py-0.5 font-bold text-[11px] text-[#fdf6e8]">
            {nickname?.trim() || "손님"}
          </span>
        )}
      </div>
    </Html>
  );
}
