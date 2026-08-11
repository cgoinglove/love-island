"use client";

import { ChevronLeft, ExternalLink, RotateCw } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Panel } from "@/components/island/Panel";
import { CHUNKY, SIGN, SIGN_ACCENT } from "@/components/island/ui";
import { useHudStore } from "@/game/hud/store";
import { ownerOf } from "@/shared/content";
import { currentLocale, t } from "@/shared/strings";
import { CAREER_PANEL_ID } from "./constants";

/**
 * 책상 노트북 — 주인장의 포트폴리오를 **그대로 띄운다.**
 *
 * ── 왜 경력을 여기 안 적나 ──
 * 한동안 경력을 `content/profile.json` 에 베껴 적어 타임라인으로 그렸다. 그런데
 * 제대로 만들어 둔 포트폴리오가 이미 따로 있는 마당에 같은 내용을 두 곳에 두면
 * **반드시 어긋난다** — 한쪽만 고치는 날이 오고, 그날부터 어느 쪽이 맞는지 알 수 없다.
 * 별 수나 가입자 수처럼 계속 변하는 숫자는 특히 그렇다.
 *
 * 그래서 노트북은 원본을 띄우기만 한다. 원본이 바뀌면 이 섬도 같이 바뀐다.
 *
 * ── 왜 바가 하나인가 ──
 * 처음엔 섬의 나무 머리띠 아래에 브라우저 창을 하나 더 얹었다. 창 안에 창이 든 꼴이라
 * 노트북을 보는 게 아니라 **노트북 스크린샷을 띄운 패널**을 보게 됐다.
 * 지금은 바가 하나뿐이고 그 아래는 화면 끝까지 사이트다 — 노트북 화면 그 자체다.
 * 나가는 길(섬으로)도 그 바 안에 있다.
 */

/**
 * 이만큼 기다려도 안 열리면 막힌 것으로 본다(ms).
 *
 * ⚠ iframe 이 X-Frame-Options 로 막혔는지는 **JS 로 알 수 없다.** 막힌 프레임도
 *   load 가 뜨기도 하고 안 뜨기도 해서, 어느 쪽도 신호로 못 쓴다. 시간으로 재는 게
 *   정직한 유일한 방법이라 그 뒤에는 "새 탭에서 열기" 를 내놓는다.
 */
const GIVE_UP_MS = 9000;

/** 접속 연출의 최소 시간(ms). 즉시 뜨면 "노트북을 켰다" 는 인상이 안 남는다. */
const MIN_BOOT_MS = 850;

export function CareerPanel() {
  const isOpen = useHudStore((state) => state.openPanelId === CAREER_PANEL_ID);
  const closePanel = useHudStore((state) => state.closePanel);

  const owner = ownerOf(currentLocale());
  const copy = t().career;

  /** 새로고침용. 값을 바꾸면 iframe 이 통째로 다시 만들어진다. */
  const [attempt, setAttempt] = useState(0);
  const [phase, setPhase] = useState<"booting" | "ready" | "blocked">(
    "booting",
  );
  const openedAt = useRef(0);

  const restart = () => {
    setAttempt((n) => n + 1);
    setPhase("booting");
    openedAt.current = Date.now();
  };

  // 닫았다 다시 열면 처음부터. 안 그러면 지난번 실패가 그대로 남아 있다.
  useEffect(() => {
    if (!isOpen) return;
    setPhase("booting");
    openedAt.current = Date.now();
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen || phase !== "booting") return;
    const timer = setTimeout(() => setPhase("blocked"), GIVE_UP_MS);
    return () => clearTimeout(timer);
  }, [isOpen, phase]);

  const host = hostOf(owner.site);

  return (
    <Panel
      open={isOpen}
      onClose={closePanel}
      bare
      fill
      surfaceClassName="bg-[#1c1c1e]"
    >
      {/* ── 바 하나. 나가는 길 · 주소 · 새로고침 · 새 탭 ── */}
      <div className="flex shrink-0 items-center gap-2 bg-[#2b2b2e] px-2.5 py-2 pt-[max(0.5rem,env(safe-area-inset-top))]">
        <button
          type="button"
          onClick={closePanel}
          className={`${CHUNKY} flex shrink-0 items-center gap-1 rounded-lg py-1.5 pr-2.5 pl-1.5 font-bold text-[13px] text-[#e8e6e3] transition hover:bg-white/10`}
        >
          <ChevronLeft className="size-4.5" />
          {t().panel.back}
        </button>

        {/* 주소창. 눌러도 안 바뀐다 — 이건 노트북 화면이지 진짜 브라우저가 아니다. */}
        <span className="min-w-0 flex-1 truncate rounded-lg bg-[#1c1c1e] px-3 py-1.5 text-center font-medium text-[12px] text-[#9b9894]">
          {host}
        </span>

        <button
          type="button"
          onClick={restart}
          aria-label={copy.retry}
          className="shrink-0 rounded-lg p-1.5 text-[#9b9894] transition hover:bg-white/10 hover:text-[#e8e6e3]"
        >
          <RotateCw className="size-4" />
        </button>
        <a
          href={owner.site}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={copy.openNewTab}
          className="shrink-0 rounded-lg p-1.5 text-[#9b9894] transition hover:bg-white/10 hover:text-[#e8e6e3]"
        >
          <ExternalLink className="size-4" />
        </a>
      </div>

      {/* ── 화면. 여기부터 끝까지 전부 사이트다. ── */}
      <div className="relative min-h-0 flex-1 bg-white">
        {phase !== "blocked" && (
          <iframe
            key={attempt}
            src={owner.site}
            title={host}
            className="size-full border-0"
            // 남의 사이트다. 이 창을 마음대로 옮기거나 파일을 내려받게 두지 않는다.
            sandbox="allow-scripts allow-same-origin allow-popups allow-forms"
            referrerPolicy="no-referrer-when-downgrade"
            onLoad={() => {
              const left = MIN_BOOT_MS - (Date.now() - openedAt.current);
              setTimeout(() => setPhase("ready"), Math.max(0, left));
            }}
          />
        )}

        {phase === "booting" && (
          /**
           * 켜지는 화면.
           *
           * 사이트가 캐시에 있으면 로드가 100ms 만에 끝난다. 그때 바로 보여주면
           * "노트북을 켰다" 가 아니라 "패널이 하나 더 열렸다" 로 읽힌다.
           */
          <div className="absolute inset-0 flex items-center justify-center bg-[#1c1c1e]">
            <p className="font-mono text-[13px] text-[#8fd39a]">
              {copy.connecting} {host}
              <span className="ml-1 inline-block w-2 animate-pulse">▍</span>
            </p>
          </div>
        )}

        {phase === "blocked" && (
          <div className="flex size-full flex-col items-center justify-center gap-4 bg-[#1c1c1e] px-8 text-center">
            <p className="font-bold text-[16px] text-[#e8e6e3]">
              {copy.blocked}
            </p>
            <p className="font-medium text-[13px] text-[#9b9894]">{host}</p>
            <div className="mt-1 flex flex-wrap justify-center gap-2">
              <a
                href={owner.site}
                target="_blank"
                rel="noopener noreferrer"
                className={`${SIGN_ACCENT} ${CHUNKY} flex items-center gap-2 px-5 py-2.5 font-bold text-[14px]`}
              >
                <ExternalLink className="size-4" />
                {copy.openNewTab}
              </a>
              <button
                type="button"
                onClick={restart}
                className={`${SIGN} ${CHUNKY} px-5 py-2.5 font-bold text-[14px]`}
              >
                {copy.retry}
              </button>
            </div>
          </div>
        )}
      </div>
    </Panel>
  );
}

/** "https://cgoinglove.github.io/" → "cgoinglove.github.io" */
function hostOf(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    // 스키마가 검증하므로 여기 올 일은 없다. 와도 주소창이 비는 것보단 낫다.
    return url;
  }
}
