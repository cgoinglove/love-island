"use client";

import { useEffect } from "react";
import { SIGN } from "@/components/island/ui";
import { isUnlocked, STAMP_GOAL, STAMPS, useStampStore } from "./stamps";

/**
 * 도장판.
 *
 * 화면 구석에 늘 떠 있다 — 뭘 해야 열리는지 안 보이면 잠금은 그냥 벽이다.
 * 다 모으면 사라진다. 할 일이 없어진 안내판은 화면만 먹는다.
 */
export function StampCard() {
  const earned = useStampStore((state) => state.earned);
  const toast = useStampStore((state) => state.toast);
  const clearToast = useStampStore((state) => state.clearToast);

  // 축하는 잠깐이면 된다. 계속 떠 있으면 다음 걸 하러 갈 수가 없다.
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(clearToast, 3200);
    return () => clearTimeout(timer);
  }, [toast, clearToast]);

  const done = STAMPS.filter((stamp) => earned[stamp.id]).length;

  return (
    <>
      {toast && (
        <div className="-translate-x-1/2 fade-in slide-in-from-top-4 fixed top-20 left-1/2 z-30 animate-in">
          <div
            className={`${SIGN} flex items-center gap-2.5 px-5 py-3 font-bold text-[15px]`}
          >
            <span className="text-[20px]">🏅</span>
            <span>
              도장 획득 — {toast.label}
              <span className="ml-2 font-semibold text-[#8a7460]">
                {done}/{STAMP_GOAL}
              </span>
            </span>
          </div>
        </div>
      )}

      {!isUnlocked(earned) && (
        /**
         * 화면 왼쪽 위, 상태 바 바로 아래.
         *
         * 처음엔 `hidden sm:block` 으로 모바일에서 숨기고 개발용 계기판과 겹치는
         * 자리에 뒀더니 "미션이 안 보인다" 는 말을 들었다. 잠금이 있는 이상
         * **무엇을 하면 열리는지는 항상 보여야** 한다 — 안 보이면 잠금은 그냥 벽이다.
         */
        <div className="fixed top-[4.2rem] left-4 z-20 block">
          <div className={`${SIGN} px-3.5 py-2.5`}>
            <p className="mb-1.5 flex items-center gap-1.5 font-bold text-[12px] text-[#8a7460]">
              <span className="text-[14px]">🏅</span>
              미션 {done}/{STAMP_GOAL}
              <span className="font-semibold text-[#a8967f]">
                — 다 모으면 열려요
              </span>
            </p>
            <ul className="flex flex-col gap-1">
              {STAMPS.map((stamp) => {
                const got = Boolean(earned[stamp.id]);
                return (
                  <li
                    key={stamp.id}
                    className={`flex items-center gap-2 font-semibold text-[13px] ${
                      got ? "text-[#5e9c55]" : "text-[#3a2a22]"
                    }`}
                  >
                    <span className="w-4 text-center">{got ? "✓" : "○"}</span>
                    <span className={got ? "line-through opacity-60" : ""}>
                      {stamp.label}
                    </span>
                  </li>
                );
              })}
            </ul>
          </div>
        </div>
      )}
    </>
  );
}

/**
 * 도장이 모자랄 때 패널 대신 보여주는 안내.
 *
 * 그냥 막으면 고장으로 보인다. **무엇을 하면 열리는지**가 같이 있어야 안내다.
 */
export function LockedNotice({ what }: { what: string }) {
  const earned = useStampStore((state) => state.earned);
  const done = STAMPS.filter((stamp) => earned[stamp.id]).length;

  return (
    <div className="flex min-h-[16rem] flex-col items-center justify-center gap-4 px-8 py-10 text-center">
      <span className="text-[44px]">🔒</span>
      <p className="font-bold text-[17px] text-[#3a2a22]">
        {what}은 도장 {STAMP_GOAL}개가 필요해요
      </p>
      <p className="font-medium text-[14px] text-[#8a7460]">
        지금 {done}개 모았습니다. 1분이면 다 찍혀요.
      </p>

      <ul className="mt-1 flex w-full max-w-xs flex-col gap-2">
        {STAMPS.map((stamp) => {
          const got = Boolean(earned[stamp.id]);
          return (
            <li
              key={stamp.id}
              className={`flex items-start gap-2.5 rounded-xl px-3 py-2 text-left ${
                got ? "bg-[#e8f2e4]" : "bg-[#f2e9d6]"
              }`}
            >
              <span className="pt-0.5 text-[15px]">{got ? "✅" : "○"}</span>
              <span>
                <span className="block font-bold text-[14px] text-[#3a2a22]">
                  {stamp.label}
                </span>
                <span className="block font-medium text-[12px] text-[#8a7460]">
                  {stamp.hint}
                </span>
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
