"use client";

import { useEffect, useState } from "react";
import {
  BACKDROP,
  CHUNKY,
  SIGN,
  WOOD_HEADER,
  WOOD_PANEL,
} from "@/components/island/ui";
import { useTouchMode } from "./touch";

const KEYS: ReadonlyArray<{ key: string; action: string }> = [
  { key: "탭", action: "그 자리로 걸어가기" },
  { key: "WASD", action: "직접 이동" },
  { key: "Shift", action: "달리기" },
  { key: "Space", action: "점프" },
  { key: "F", action: "밀치기" },
  { key: "E", action: "가까운 것과 상호작용" },
  { key: "Enter", action: "말 걸기" },
  { key: "1 2 3", action: "하트 · 폭죽 · 축포" },
  { key: "cgoing-bot", action: "안내 봇에게 말 걸기" },
  { key: "?", action: "이 목록" },
];

/**
 * 단축키 표. `?` 로 열고 닫는다.
 *
 * 처음엔 화면 아래에 항상 깔아뒀는데, 익숙해진 뒤로는 그냥 가림막이었다.
 * 처음 3초만 보여주고 그 다음부터는 불러야 나오게 했다.
 */
export function Shortcuts() {
  const [open, setOpen] = useState(false);
  const touch = useTouchMode();

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (
        target?.tagName === "INPUT" ||
        target?.tagName === "TEXTAREA" ||
        target?.isContentEditable
      ) {
        return;
      }
      if (event.key === "?" || event.key === "/") {
        event.preventDefault();
        setOpen((value) => !value);
      }
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  /**
   * 손가락으로 노는 화면에는 아예 안 뜬다.
   *
   * 자리가 조이스틱과 정확히 겹치는 것도 문제지만, 더 큰 이유는 **내용이 소용없다**는
   * 것이다. WASD · Shift · F 를 알려주는 표를 키보드 없는 기기에 띄울 이유가 없다.
   */
  if (touch) return null;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className={`fixed bottom-5 left-5 z-20 size-10 font-bold text-[16px] hover:brightness-[1.04] ${SIGN} ${CHUNKY}`}
        aria-label="단축키"
      >
        ?
      </button>

      {open && (
        <div className="fade-in fixed inset-0 z-30 flex animate-in items-center justify-center p-4">
          <button
            type="button"
            aria-label="닫기"
            onClick={() => setOpen(false)}
            className={`absolute inset-0 cursor-default ${BACKDROP} backdrop-blur-[2px]`}
          />
          <div
            className={`zoom-in-95 relative w-full max-w-sm animate-in overflow-hidden rounded-3xl ${WOOD_PANEL}`}
          >
            <p className={`px-5 py-2.5 font-bold text-[13px] ${WOOD_HEADER}`}>
              조작법
            </p>
            <div className="p-5">
              <dl className="grid gap-2">
                {KEYS.map((item) => (
                  <div key={item.key} className="flex items-center gap-3">
                    <dt className="w-20 shrink-0">
                      <kbd className="inline-block rounded-lg bg-[#e5d7bd] px-2 py-1 font-bold text-[12px] text-[#4a3428] shadow-[0_2px_0_0_#c4b193]">
                        {item.key}
                      </kbd>
                    </dt>
                    <dd className="font-medium text-[14px] text-[#5c4a3c]">
                      {item.action}
                    </dd>
                  </div>
                ))}
              </dl>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
