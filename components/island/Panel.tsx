"use client";

import { ChevronLeft } from "lucide-react";
import { type ReactNode, useEffect } from "react";
import { CHUNKY, WOOD_HEADER } from "@/components/island/ui";
import { cn } from "@/lib/utils";

export interface PanelProps {
  open: boolean;
  /** 머리띠 왼쪽에 박히는 짧은 이름. 예: "경력 수첩" */
  slug: string;
  title: string;
  subtitle?: string;
  onClose: () => void;
  children: ReactNode;
  /** 본문 바탕. 게시판은 코르크, 사진첩은 흰 종이 — 컨텐츠가 재료를 고른다. */
  surfaceClassName?: string;
  /** 머리띠 오른쪽에 얹을 것(개수 · 필터 등). */
  action?: ReactNode;
  /** 스크롤 밖에 고정되는 아래 띠. 방명록의 쪽지 입력이 여기 붙는다. */
  footer?: ReactNode;
  /**
   * 제목 줄의 폭. 본문과 **같은 폭**을 넘겨야 제목과 내용의 왼쪽 끝이 맞는다.
   * 기본값은 글 읽기에 좋은 폭이고, 사진첩처럼 좁은 단을 쓰는 화면은 이걸 바꾼다.
   */
  titleClassName?: string;
}

/**
 * feature 패널의 공통 껍데기 — **화면을 통째로 쓴다.**
 *
 * ── 왜 전체화면인가 ──
 * 한때 가운데 뜨는 창(max-w-2xl)이었다. 그러다 보니 어느 화면에서도 컨텐츠가
 * 좁은 관에 담겼다. 27인치 모니터에서는 양옆이 텅 비고, 폰에서는 창 테두리가
 * 화면 폭을 먹었다. 이 앱에서 패널을 여는 건 "잠깐 들여다보는" 게 아니라
 * **읽으러 들어가는** 행동이다 — 경력을 읽고, 사진을 넘기고, 쪽지를 훑는다.
 * 그 시간 동안 뒤의 3D 는 볼 일이 없으니 화면을 다 내주는 게 맞다.
 *
 * 대신 **본문 폭은 컨텐츠가 정한다.** 전체화면이라고 글줄을 2560px 로 늘이면
 * 읽을 수가 없다. 껍데기는 화면을 다 쓰고, 안쪽에서 각자 max-w 를 잡는다.
 *
 * 머리띠는 그대로 나무다 — 화면을 다 덮어도 여긴 여전히 섬 안이어야 한다.
 */
export function Panel({
  open,
  slug,
  title,
  subtitle,
  onClose,
  children,
  surfaceClassName,
  action,
  footer,
  titleClassName = "max-w-5xl",
}: PanelProps) {
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
      // 패널이 열려 있는 동안 WASD 가 캐릭터를 움직이면 안 된다.
      event.stopPropagation();
    };
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [open, onClose]);

  /**
   * 열려 있는 동안 문서 스크롤을 잠근다.
   * 전체화면이 되면서 iOS 사파리가 바닥 고무줄 스크롤로 주소창을 흔든다 —
   * 안쪽 스크롤 컨테이너와 겹쳐서 손가락이 어느 쪽을 미는지 알 수 없게 된다.
   */
  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [open]);

  if (!open) return null;

  return (
    <section className="fade-in fixed inset-0 z-30 flex animate-in flex-col bg-[#fdf6e8] duration-150">
      {/*
        머리띠. 왼쪽에 뒤로가기, 가운데 이름, 오른쪽에 컨텐츠가 얹는 것.
        전체화면에서는 X 하나보다 **뒤로가기**가 맞다 — 창을 닫는 게 아니라
        섬으로 돌아가는 것이기 때문이다.
      */}
      <header
        className={`flex shrink-0 items-center gap-2 px-3 py-2.5 pt-[max(0.625rem,env(safe-area-inset-top))] ${WOOD_HEADER}`}
      >
        <button
          type="button"
          onClick={onClose}
          className={`${CHUNKY} -ml-1 flex items-center gap-1 rounded-xl py-1.5 pr-3 pl-1.5 font-bold text-[14px] text-[#fdf6e8] transition hover:bg-[#fdf6e8]/15`}
        >
          <ChevronLeft className="size-5" />
          섬으로
        </button>
        <span className="min-w-0 flex-1 truncate text-center font-bold text-[13px] text-[#fdf6e8]/75 tracking-wide">
          {slug}
        </span>
        <div className="flex min-w-[5.5rem] justify-end">{action}</div>
      </header>

      <div
        className={cn(
          "min-h-0 flex-1 overflow-y-auto overscroll-contain",
          surfaceClassName,
        )}
      >
        {/*
          제목은 스크롤과 함께 흘러간다. 전체화면에서 제목까지 고정하면
          작은 화면의 세로가 머리띠 둘로 반쯤 먹힌다.
        */}
        <div
          className={cn(
            "mx-auto w-full px-5 pt-7 pb-5 sm:px-8",
            titleClassName,
          )}
        >
          <h2 className="font-bold text-[26px] text-[#3a2a22] sm:text-[32px]">
            {title}
          </h2>
          {subtitle && (
            <p className="mt-1.5 font-medium text-[14px] text-[#8a7460]">
              {subtitle}
            </p>
          )}
        </div>

        {children}
      </div>

      {footer && <div className="shrink-0">{footer}</div>}
    </section>
  );
}
