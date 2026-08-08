"use client";

import { useCallback, useEffect, useRef } from "react";
import { CHUNKY, SIGN, SIGN_ACCENT } from "@/components/island/ui";
import { awardStamp } from "@/game/hud/stamps";
import { getMyPlayerId } from "@/game/net/presence";
import { serverNow } from "@/game/net/serverClock";
import { ROOM_ISLAND } from "@/shared/constants";
import { OWNER } from "@/shared/content";
import { catchableById, catchResult } from "@/shared/fishing";
import {
  BITE_WINDOW_MS,
  CAST_SECONDS,
  useFishingStore,
  WAIT_MAX_MS,
  WAIT_MIN_MS,
} from "./session";

/**
 * 낚시 조작.
 *
 * 화면에 남는 건 지금 뭘 눌러야 하는지 알려주는 **한 줄**뿐이다.
 * 나머지는 3D 로 벌어진다(Tackle.tsx) — 물에 던지고, 찌가 까딱이고, 쑥 잠긴다.
 * 잡은 결과만 카드로 띄운다. 쿠폰은 캡처해서 보내야 하니 읽을 수 있어야 하기 때문이다.
 */
export function FishingHud() {
  const stage = useFishingStore((state) => state.stage);
  const caught = useFishingStore((state) => state.caught);
  const error = useFishingStore((state) => state.error);
  const set = useFishingStore((state) => state.set);
  const setCaught = useFishingStore((state) => state.setCaught);
  const setError = useFishingStore((state) => state.setError);
  const leave = useFishingStore((state) => state.leave);

  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const clearTimers = useCallback(() => {
    for (const timer of timers.current) clearTimeout(timer);
    timers.current = [];
  }, []);

  /**
   * ⚠ 정리(cleanup)를 stage 에 의존하는 effect 에 두면 안 된다.
   *
   * 그렇게 뒀다가 입질이 영영 안 왔다 — 단계가 바뀔 때마다 리액트가 cleanup 을
   * 먼저 돌려서, 던지기가 방금 건 타이머를 자기가 지워버렸기 때문이다.
   * 언마운트 정리와 "자리를 떴을 때 정리"는 다른 일이므로 effect 도 나눈다.
   */
  useEffect(() => clearTimers, [clearTimers]);

  useEffect(() => {
    // 자리를 뜨면 진행 중이던 판도 접는다. 안 그러면 떠난 뒤에 입질이 온다.
    if (stage === "away") clearTimers();
  }, [stage, clearTimers]);

  const cast = useCallback(() => {
    clearTimers();
    set("casting", serverNow() + CAST_SECONDS * 1000);

    timers.current.push(
      setTimeout(() => {
        set("waiting");
        const wait = WAIT_MIN_MS + Math.random() * (WAIT_MAX_MS - WAIT_MIN_MS);
        timers.current.push(
          setTimeout(() => {
            set("bite", serverNow() + BITE_WINDOW_MS);
            timers.current.push(
              setTimeout(() => {
                // 놓치면 그걸로 한 판 끝.
                if (useFishingStore.getState().stage === "bite") set("missed");
              }, BITE_WINDOW_MS),
            );
          }, wait),
        );
      }, CAST_SECONDS * 1000),
    );
  }, [clearTimers, set]);

  const reel = useCallback(async () => {
    clearTimers();
    set("reeling");

    try {
      const response = await fetch("/api/catch", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ playerId: getMyPlayerId(), room: ROOM_ISLAND }),
      });

      if (response.status === 429) {
        setError("오늘은 이 정도만. 한 시간 뒤에 다시 오세요.");
        return;
      }
      if (!response.ok) throw new Error(String(response.status));

      const parsed = catchResult.parse(await response.json());
      const item = catchableById(parsed.itemId);
      if (!item) throw new Error("모르는 물건");

      setCaught({ item, code: parsed.code, at: parsed.caughtAt });
      // 잡든 못 잡든 "던져봤다" 가 도장 조건이다. 운으로 미션을 막으면 안 된다.
      awardStamp("fished");
    } catch (caughtError) {
      console.error("[fishing] 실패", caughtError);
      setError("줄이 끊어졌습니다. 다시 던져보세요.");
    }
  }, [clearTimers, set, setCaught, setError]);

  /** 스페이스로 던지고 챈다. 낚시 중엔 이동 키가 필요 없다. */
  useEffect(() => {
    if (stage === "away") return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        leave();
        return;
      }
      if (event.key !== " " && event.key !== "Enter") return;
      event.preventDefault();
      event.stopPropagation();
      if (stage === "ready" || stage === "missed") cast();
      else if (stage === "bite") void reel();
      else if (stage === "caught") cast();
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [stage, cast, reel, leave]);

  if (stage === "away") return null;

  return (
    <div className="-translate-x-1/2 pointer-events-none fixed bottom-24 left-1/2 z-20 flex flex-col items-center gap-3">
      {caught && stage === "caught" && <CatchCard />}

      <div className="pointer-events-auto flex items-center gap-2">
        <Prompt
          stage={stage}
          error={error}
          onCast={cast}
          onReel={() => void reel()}
        />
        <button
          type="button"
          onClick={leave}
          className={`${SIGN} ${CHUNKY} px-3.5 py-2 font-bold text-[13px]`}
        >
          그만
        </button>
      </div>
    </div>
  );
}

function Prompt({
  stage,
  error,
  onCast,
  onReel,
}: {
  stage: string;
  error: string | null;
  onCast: () => void;
  onReel: () => void;
}) {
  if (error) {
    return (
      <button
        type="button"
        onClick={onCast}
        className={`${SIGN} ${CHUNKY} px-5 py-2.5 font-bold text-[14px] text-[#8c3d1e]`}
      >
        {error}
      </button>
    );
  }

  if (stage === "casting") {
    return <Still text="던지는 중…" />;
  }
  if (stage === "waiting") {
    return <Still text="기다리는 중… 찌를 보세요" />;
  }
  if (stage === "reeling") {
    return <Still text="끌어올리는 중…" />;
  }
  if (stage === "bite") {
    return (
      <button
        type="button"
        onClick={onReel}
        className={`${SIGN_ACCENT} ${CHUNKY} animate-pulse px-8 py-3 font-black text-[17px]`}
      >
        지금! (Space)
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={onCast}
      className={`${SIGN_ACCENT} ${CHUNKY} px-7 py-2.5 font-bold text-[15px]`}
    >
      {stage === "missed"
        ? "놓쳤어요 — 다시 던지기"
        : stage === "caught"
          ? "한 번 더 (Space)"
          : "던지기 (Space)"}
    </button>
  );
}

function Still({ text }: { text: string }) {
  return (
    <span className={`${SIGN} px-5 py-2.5 font-bold text-[14px]`}>{text}</span>
  );
}

/**
 * 잡은 것.
 *
 * 걸린 건 딱 두 가지다 — **꽝**, 그리고 아주 드물게 진짜 커피 쿠폰.
 * 그래서 꽝일 때는 크게 "꽝" 이라고 쓰고, 바로 아래에 그 위에 뭐가 있는지 알려준다.
 * 뭘 노리는지 모르면 한 번 던져보고 끝이다.
 */
function CatchCard() {
  const caught = useFishingStore((state) => state.caught);
  if (!caught) return null;
  const { item, code, at } = caught;
  const blank = item.tier !== "real";

  return (
    <div
      className={`${SIGN} zoom-in w-[min(22rem,calc(100vw-2rem))] animate-in px-5 py-4 text-center`}
    >
      {blank && (
        <p className="font-black text-[13px] text-[#b08968] tracking-[0.3em]">
          꽝
        </p>
      )}
      <span className="text-[40px] leading-none">{item.emoji}</span>
      <p className="mt-1 font-bold text-[17px] text-[#3a2a22]">{item.name}</p>
      <p className="mt-1 font-medium text-[13px] text-[#8a7460]">
        {item.blurb}
      </p>

      {blank && (
        <p className="mt-3 rounded-xl bg-[#f3e8d6] px-3 py-2 font-semibold text-[12px] text-[#6b5442] leading-relaxed">
          ☕ 이 위에 딱 하나, <b className="text-[#c2562f]">아메리카노 쿠폰</b>
          이 있습니다.
          <br />
          주인장이 진짜로 사줍니다. 한 번 더 던져보세요.
        </p>
      )}

      {code && (
        /**
         * 쿠폰. 이 화면 자체가 증표라서 코드·시각·연락처가 한 장에 다 보여야 한다 —
         * 캡처해서 보내는 게 전부인 흐름이니, 캡처 한 장에 정보가 빠지면 안 된다.
         */
        <div className="mt-3 rounded-2xl border-2 border-[#e8734a] border-dashed bg-[#fff6ef] px-4 py-3">
          <p className="font-bold text-[11px] text-[#c2562f] tracking-widest">
            교환 코드
          </p>
          <p className="mt-0.5 font-black text-[24px] text-[#3a2a22] tracking-[0.15em] tabular-nums">
            {code}
          </p>
          <p className="mt-1 font-medium text-[11px] text-[#8a7460]">
            {new Date(at).toLocaleString("ko-KR")}
          </p>
          <p className="mt-2 font-semibold text-[12px] text-[#5c4a3c] leading-relaxed">
            이 화면을 캡처해서{" "}
            <span className="font-bold text-[#c2562f]">{OWNER.contact}</span>{" "}
            으로 보내주세요. 진짜로 삽니다.
          </p>
        </div>
      )}
    </div>
  );
}
