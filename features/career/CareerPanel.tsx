"use client";

import { Panel } from "@/components/island/Panel";
import { LockedNotice } from "@/game/hud/StampCard";
import { isUnlocked, useStampStore } from "@/game/hud/stamps";
import { useHudStore } from "@/game/hud/store";
import { OWNER } from "@/shared/content";
import { CAREER_PANEL_ID } from "./constants";
import { CAREER_ENTRIES, CAREER_INTRO } from "./content";

/**
 * 경력 및 프로젝트.
 *
 * ── 전체화면에서 무엇이 달라지나 ──
 * 좁은 창에서는 목록을 세로로 쌓는 것 말고 선택지가 없었다. 화면을 다 쓰면
 * **왼쪽에 사람, 오른쪽에 이력**을 놓을 수 있다. 넓은 화면에서 왼쪽 칸이 따라붙어
 * 있으면 스크롤을 한참 내려도 "누구의 이력을 읽고 있는지" 가 사라지지 않는다.
 *
 * 글줄은 여전히 좁게 잡는다(max-w-5xl · 2단). 화면이 넓다고 한 줄을 2560px 로
 * 늘이면 눈이 줄 끝에서 다음 줄 머리를 못 찾는다.
 */
export function CareerPanel() {
  const isOpen = useHudStore((state) => state.openPanelId === CAREER_PANEL_ID);
  const closePanel = useHudStore((state) => state.closePanel);

  const earned = useStampStore((state) => state.earned);
  const unlocked = isUnlocked(earned);

  return (
    <Panel
      open={isOpen}
      onClose={closePanel}
      slug="경력 수첩"
      title="경력 및 프로젝트"
      subtitle={CAREER_INTRO}
    >
      {!unlocked ? (
        <LockedNotice what="경력 및 프로젝트" />
      ) : (
        <div className="mx-auto grid w-full max-w-5xl gap-8 px-5 pb-[max(3rem,env(safe-area-inset-bottom))] sm:px-8 lg:grid-cols-[15rem_1fr] lg:gap-12">
          {/* 왼쪽: 누구인가. 넓은 화면에서는 스크롤을 따라온다. */}
          <aside className="lg:sticky lg:top-6 lg:self-start">
            <div className="rounded-2xl border-2 border-[#e0d2b6] bg-[#f6ecd8] px-5 py-5">
              <p className="font-black text-[20px] text-[#3a2a22]">
                {OWNER.name}
              </p>
              <p className="mt-1 font-medium text-[13px] text-[#8a7460] leading-relaxed">
                {OWNER.tagline}
              </p>
              <a
                href={`mailto:${OWNER.contact}`}
                className="mt-3 inline-block break-all font-bold text-[13px] text-[#c2562f] underline decoration-[#e8b79f] underline-offset-4"
              >
                {OWNER.contact}
              </a>
            </div>
          </aside>

          {/* 오른쪽: 무엇을 했는가. */}
          <ol className="relative flex flex-col gap-8 border-[#e0d2b6] border-l-2 pl-6">
            {CAREER_ENTRIES.map((entry) => (
              <li key={`${entry.period}-${entry.org}`} className="relative">
                {/* 타임라인 점 */}
                <span className="-left-7.75 absolute top-2 size-3.5 rounded-full bg-[#e8734a] ring-4 ring-[#fdf6e8]" />
                <p className="font-bold text-[13px] text-[#c2562f] tabular-nums">
                  {entry.period}
                </p>
                <h3 className="mt-0.5 font-bold text-[20px] text-[#3a2a22] sm:text-[22px]">
                  {entry.role}
                </h3>
                <p className="font-semibold text-[14px] text-[#8a7460]">
                  {entry.org}
                </p>
                <p className="mt-2.5 max-w-prose whitespace-pre-wrap font-medium text-[16px] text-[#5c4a3c] leading-relaxed">
                  {entry.body}
                </p>
                {entry.stack.length > 0 && (
                  <ul className="mt-3 flex flex-wrap gap-1.5">
                    {entry.stack.map((item) => (
                      <li
                        key={item}
                        className="rounded-lg bg-[#ece0c8] px-2.5 py-1 font-bold text-[12px] text-[#6b5442]"
                      >
                        {item}
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            ))}
          </ol>
        </div>
      )}
    </Panel>
  );
}
