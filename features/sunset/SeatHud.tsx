"use client";

import { CHUNKY, SIGN } from "@/components/island/ui";
import { t } from "@/shared/strings";
import { useSeatStore } from "./seat";

/**
 * 앉았을 때 화면.
 *
 * ── 왜 검은 띠인가 ──
 * 카메라가 캐릭터를 놓고 수평선을 보는 순간, 화면은 "조작하는 화면" 에서
 * "보는 화면" 으로 바뀐다. 그 전환을 말로 설명할 수는 없고 **화면 모양으로**
 * 알려야 한다 — 위아래로 띠가 들어오면 누구나 안다. 지금은 볼 시간이라고.
 *
 * 그래서 여기 있는 UI 는 그것 하나와, 어떻게 빠져나가는지 한 줄뿐이다.
 * 앉아서 볼 것이 있는 자리에 버튼을 늘어놓으면 앉은 의미가 없다.
 */
export function SeatHud() {
  const seated = useSeatStore((state) => state.index);
  const stand = useSeatStore((state) => state.stand);
  const on = seated !== null;

  return (
    <div className="pointer-events-none fixed inset-0 z-30" aria-hidden={!on}>
      {/*
        띠는 항상 붙어 있고 높이만 변한다. 조건부로 붙였다 떼면 전환이 없고,
        전환이 없으면 그냥 화면이 잘린 것처럼 보인다.
      */}
      <div
        className="absolute inset-x-0 top-0 bg-black transition-[height] duration-700 ease-out"
        style={{ height: on ? "11vh" : "0vh" }}
      />
      <div
        className="absolute inset-x-0 bottom-0 bg-black transition-[height] duration-700 ease-out"
        style={{ height: on ? "11vh" : "0vh" }}
      />

      {/*
        안내와 일어나기는 **위**에 둔다.
        아래 가장자리는 대화가 쓴다 — 둘이 앉아 얘기하면서 보는 자리라
        입력창과 말풍선이 그쪽을 차지해야 한다.
      */}
      <div
        className={`-translate-x-1/2 pointer-events-auto absolute top-[13vh] left-1/2 flex flex-col items-center gap-2 transition-opacity duration-500 ${
          on ? "opacity-100" : "pointer-events-none opacity-0"
        }`}
      >
        <p className="rounded-full bg-black/45 px-4 py-1.5 font-semibold text-[13px] text-white/90">
          {t().sunset.caption}
        </p>
        <button
          type="button"
          onClick={stand}
          className={`${SIGN} ${CHUNKY} px-5 py-2 font-bold text-[13px]`}
        >
          {t().sunset.stand}
        </button>
      </div>
    </div>
  );
}
