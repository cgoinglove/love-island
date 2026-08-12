"use client";

import { MessageCircle, SendHorizontal } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { CHUNKY, SIGN, SIGN_ACCENT } from "@/components/island/ui";
import { emitRoomEvent } from "@/game/net/presence";
import { CHAT_MAX } from "@/shared/constants";
import { REACTION_COOLDOWN_MS, type ReactionKind } from "@/shared/presence";
import { t } from "@/shared/strings";
import { useHudStore } from "./store";
import { useTouchMode } from "./touch";

const EMOTES = ["👋", "🙂", "🎉", "❤️", "😮", "🔥"] as const;

const REACTIONS: readonly {
  kind: ReactionKind;
  icon: string;
  key: string;
  tint: string;
}[] = [
  {
    kind: "heart",
    icon: "♥",
    key: "1",
    tint: "bg-[#ffe3e9] text-[#c2185b] border-[#e8a0b4]",
  },
  {
    kind: "firework",
    icon: "✸",
    key: "2",
    tint: "bg-[#fff0cc] text-[#b7791f] border-[#e0bd7a]",
  },
  {
    kind: "confetti",
    icon: "✦",
    key: "3",
    tint: "bg-[#d9f0fa] text-[#1f6f8f] border-[#8fc6dc]",
  },
];

/** 종류로 바로 찾는 표. 폰의 단일 버튼이 방금 나간 것의 모습을 쓴다. */
const REACTION_BY_KIND = Object.fromEntries(
  REACTIONS.map((item) => [item.kind, item]),
) as Record<ReactionKind, (typeof REACTIONS)[number]>;

/**
 * 화면 아래 가운데의 조작 독 — 채팅 입력과 감정표현.
 *
 * 채팅은 로그를 안 남긴다. 지나간 말은 머리 위 말풍선으로만 흐른다 —
 * 여긴 채팅 앱이 아니라 섬이고, 대화 기록이 화면 절반을 먹으면 섬이 안 보인다.
 * 남겨야 할 말은 방명록이 받는다.
 */
export function ChatComposer() {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const touch = useTouchMode();
  const setChatOpen = useHudStore((state) => state.setChatOpen);
  /**
   * 앉아 있으면 아래 검은 띠(11vh) 위로 올라앉는다.
   * 띠 뒤에 반쯤 잠긴 입력창은 안 보이는 것과 같다.
   */
  const sitting = useHudStore((state) => state.immersive);
  const dockBottom = sitting
    ? "bottom-[13vh]"
    : "bottom-[max(1.5rem,env(safe-area-inset-bottom))]";

  // 조작 UI 가 서로 자리를 비켜주려면 누가 화면 어디를 쓰는지 알아야 한다.
  useEffect(() => {
    setChatOpen(open);
    return () => setChatOpen(false);
  }, [open, setChatOpen]);

  /**
   * 닫은 직후 잠깐 Enter 를 무시한다.
   *
   * 없으면 입력창이 계속 되살아났다. 보내기 버튼을 눌러 닫으면 포커스가 그 버튼에
   * 남는데, 버튼이 사라지며 포커스가 body 로 가고 그 다음 Enter 가 곧장 열기
   * 단축키로 잡혔다. 키를 누르고 있으면 keydown 이 반복 발생하는 것도 같은 결과를 냈다.
   */
  const suppressUntil = useRef(0);
  const lastReaction = useRef(0);

  const close = useCallback(() => {
    setOpen(false);
    setDraft("");
    suppressUntil.current = Date.now() + 220;
    // 포커스를 명시적으로 놓아준다. 사라지는 버튼에 포커스가 남으면
    // 다음 Enter/Space 가 그 버튼의 click 으로도 한 번 더 잡힌다.
    (document.activeElement as HTMLElement | null)?.blur();
  }, []);

  /**
   * 마지막으로 나간 것. 버튼이 그 모습으로 바뀐다.
   *
   * 무작위인데 버튼이 늘 같은 모양이면 "눌러도 똑같은 게 나온다"로 읽힌다.
   * 방금 뭐가 나갔는지 버튼이 보여주면 무작위라는 게 저절로 전달된다.
   */
  const [lastKind, setLastKind] = useState<ReactionKind>("heart");

  const react = useCallback((kind: ReactionKind) => {
    const now = Date.now();
    if (now - lastReaction.current < REACTION_COOLDOWN_MS) return;
    lastReaction.current = now;
    emitRoomEvent("fx", kind);
  }, []);

  /** 셋 중 하나를 무작위로. 폰에서는 버튼이 하나뿐이다. */
  const reactRandom = useCallback(() => {
    const item =
      REACTIONS[Math.floor(Math.random() * REACTIONS.length)] ?? REACTIONS[0];
    if (!item) return;
    setLastKind(item.kind);
    react(item.kind);
  }, [react]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const typing =
        target?.tagName === "INPUT" ||
        target?.tagName === "TEXTAREA" ||
        target?.isContentEditable;
      if (typing) return;
      // 키를 누르고 있는 동안의 반복 입력은 조작이 아니다.
      if (event.repeat) return;
      if (event.metaKey || event.ctrlKey || event.altKey) return;

      const reaction = REACTIONS.find((item) => item.key === event.key);
      if (reaction) {
        event.preventDefault();
        react(reaction.kind);
        return;
      }

      if (event.key === "Enter" || event.code === "KeyT") {
        if (Date.now() < suppressUntil.current) return;
        event.preventDefault();
        setOpen(true);
        requestAnimationFrame(() => inputRef.current?.focus());
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [react]);

  function send() {
    const text = draft.trim().slice(0, CHAT_MAX);
    if (text.length > 0) emitRoomEvent("chat", text);
    close();
  }

  const openInput = () => {
    setOpen(true);
    requestAnimationFrame(() => inputRef.current?.focus());
  };

  if (!open) {
    /**
     * 손가락으로 노는 화면에서는 **아래 가장자리를 조작이 다 쓴다** —
     * 왼쪽 조이스틱, 오른쪽 점프·밀기. 데스크톱 배치(가운데 아래 한 줄)를
     * 그대로 두면 그 위에 정확히 겹쳐 앉는다.
     *
     * 그래서 오른쪽 세로줄 하나에 **말 걸기와 감정표현 둘만** 세워 액션 버튼 위에 쌓는다.
     * 감정표현 셋을 각각 두면 폰 세로 화면의 오른쪽이 버튼 다섯 줄로 덮여서
     * 정작 섬이 안 보였다 — 하나로 합치고 셋 중 하나가 무작위로 나가게 했다.
     * 어차피 셋 다 "반가움"을 내는 장치라, 고르는 재미보다 화면이 넓은 게 낫다.
     */
    if (touch) {
      return (
        <div
          className={`fixed right-5 ${
            sitting ? "bottom-[16vh]" : "bottom-46"
          } z-40 flex flex-col gap-2.5`}
        >
          <button
            type="button"
            aria-label={t().hud.chatOpen}
            onClick={openInput}
            className={`${SIGN} ${CHUNKY} flex size-12 items-center justify-center rounded-full`}
          >
            <MessageCircle className="size-5.5 text-[#e8734a]" />
          </button>

          <button
            type="button"
            aria-label={t().hud.reactions[lastKind]}
            onPointerDown={(event) => {
              event.preventDefault();
              reactRandom();
            }}
            className={`${CHUNKY} flex size-12 touch-none items-center justify-center rounded-full text-[20px] ring-2 ring-[#4a3428] ${
              REACTION_BY_KIND[lastKind].tint
            }`}
          >
            {REACTION_BY_KIND[lastKind].icon}
          </button>
        </div>
      );
    }

    return (
      /*
        좁은 화면에서는 두 덩어리가 가로로 안 들어가 "말 걸기" 가 한 글자씩
        세로로 쪼개지고 나침반과 겹쳤다. shrink 를 막고 줄바꿈을 끄면
        폭이 모자랄 때 버튼이 찌그러지는 대신 가운데 정렬을 유지한다.
      */
      <div
        className={`-translate-x-1/2 fixed ${dockBottom} left-1/2 z-40 flex max-w-[calc(100vw-1.5rem)] items-center gap-2`}
      >
        <button
          type="button"
          onClick={openInput}
          className={`${SIGN} ${CHUNKY} flex shrink-0 items-center gap-2 whitespace-nowrap px-5 py-2.5 font-bold text-[15px] hover:brightness-[1.04]`}
        >
          <span className="text-[#e8734a]">💬</span>
          {t().hud.chatOpen}
          <kbd className="rounded-md bg-[#e5d7bd] px-1.5 py-0.5 font-semibold text-[11px] text-[#6b5442]">
            Enter
          </kbd>
        </button>

        <div
          className={`${SIGN} flex shrink-0 items-center gap-2 border-b-4 px-2.5 py-2`}
        >
          {REACTIONS.map((item) => (
            <button
              key={item.kind}
              type="button"
              title={`${t().hud.reactions[item.kind]} (${item.key})`}
              onClick={() => react(item.kind)}
              className={`${CHUNKY} relative flex size-10 items-center justify-center rounded-xl text-[18px] ring-2 ring-[#4a3428] hover:brightness-[1.06] ${item.tint}`}
            >
              {item.icon}
              <span className="-top-1.5 -right-1.5 absolute flex size-4 items-center justify-center rounded-full bg-[#4a3428] font-bold text-[10px] text-[#fdf6e8]">
                {item.key}
              </span>
            </button>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div
      className={`-translate-x-1/2 fade-in slide-in-from-bottom-2 fixed ${
        sitting ? "bottom-[13vh]" : "bottom-6"
      } left-1/2 z-40 w-[min(34rem,calc(100vw-2rem))] animate-in`}
    >
      <div className="mb-2.5 flex justify-center gap-1.5">
        {EMOTES.map((emoji) => (
          <button
            key={emoji}
            type="button"
            // 입력창이 blur 되면 그 순간 창이 닫혀 클릭이 도착하기 전에 버튼이 사라진다.
            // mousedown 을 막으면 포커스가 안 옮겨가고, 그래서 클릭이 살아남는다.
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => {
              emitRoomEvent("emote", emoji);
              close();
            }}
            className={`${SIGN} ${CHUNKY} px-2.5 py-1 text-[19px] hover:brightness-[1.04]`}
          >
            {emoji}
          </button>
        ))}
      </div>

      <div className={`${SIGN} flex items-center gap-2 py-2 pr-2 pl-4`}>
        <input
          ref={inputRef}
          value={draft}
          maxLength={CHAT_MAX}
          onChange={(event) => setDraft(event.target.value)}
          onBlur={() => {
            if (draft.length === 0) close();
          }}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              // 한글 조합 중의 Enter 는 글자를 확정하는 키다. 여기서 보내면
              // 마지막 글자가 잘린 채 나간다.
              if (event.nativeEvent.isComposing) return;
              send();
            }
            if (event.key === "Escape") {
              event.preventDefault();
              close();
            }
          }}
          placeholder={t().hud.chatPlaceholder}
          className="min-w-0 flex-1 bg-transparent font-medium text-[15px] text-[#3a2a22] outline-none placeholder:text-[#a8967f]"
        />
        {/*
          글자 수는 안 보여준다. maxLength 가 이미 막고 있고, 한 줄 채팅에서
          숫자를 세는 사람은 없다 — 있으면 시선만 뺏는다.
        */}
        <button
          type="button"
          aria-label={t().hud.send}
          onMouseDown={(event) => event.preventDefault()}
          onClick={send}
          className={`${SIGN_ACCENT} ${CHUNKY} flex size-9 shrink-0 items-center justify-center rounded-full hover:brightness-[1.05]`}
        >
          <SendHorizontal className="size-4" />
        </button>
      </div>
    </div>
  );
}
