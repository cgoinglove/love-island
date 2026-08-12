"use client";

import { useCallback, useEffect, useRef } from "react";
import { CHUNKY, SIGN, SIGN_ACCENT } from "@/components/island/ui";
import { isTypingTarget } from "@/game/core/input/keyboard";
import { serverNow } from "@/game/net/serverClock";
import { OWNER_CONTACT } from "@/shared/content";
import { REAL_CHANCE_PERCENT, rollCatch } from "@/shared/fishing";
import { currentLocale, type Dict, t } from "@/shared/strings";
import {
  BITE_WINDOW_MS,
  CAST_SECONDS,
  FIGHT_MS,
  type FishingStage,
  useFishingStore,
  WAIT_MAX_MS,
  WAIT_MIN_MS,
} from "./session";

/**
 * 낚시 조작.
 *
 * 화면에 남는 건 지금 뭘 눌러야 하는지 알려주는 **한 줄**뿐이다.
 * 나머지는 3D 로 벌어진다(Tackle.tsx) — 던지고, 찌가 까딱이고, 쑥 잠기고,
 * 챈 뒤에는 물속에서 째다가 물보라와 함께 튀어나온다.
 * 잡은 결과만 카드로 띄운다. 캡처해서 보내야 하니 읽을 수 있어야 하기 때문이다.
 */
export function FishingHud() {
  const stage = useFishingStore((state) => state.stage);
  const caught = useFishingStore((state) => state.caught);
  const set = useFishingStore((state) => state.set);
  const startFight = useFishingStore((state) => state.startFight);
  const land = useFishingStore((state) => state.land);
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

  /**
   * 줄을 챈다.
   *
   * ⚠ 예전엔 여기서 서버에 물어봤다(`/api/catch` → `catch` 테이블). 진짜 커피가
   *   걸려 있으니 클라이언트를 못 믿는다는 논리였는데, 그 대가로 **낚시에서 가장
   *   짜릿해야 할 순간이 통째로 로딩**이 됐다. 게다가 지켜주는 것도 없었다 —
   *   보상은 화면을 캡처해 보내는 방식이고, 캡처는 어차피 위조할 수 있다.
   *
   * 지금은 그 자리에서 굴린다. 결과는 **즉시** 정해지고, 그 뒤 1.15초는
   * 기다림이 아니라 씨름이다(Tackle.tsx) — 무엇이 걸렸는지에 따라 물보라
   * 색까지 달라지므로, 결과를 먼저 정하는 게 연출에도 필요하다.
   */
  const reel = useCallback(() => {
    clearTimers();
    const item = rollCatch(Math.random);
    startFight(item, serverNow() + FIGHT_MS);
    timers.current.push(
      setTimeout(() => {
        land({ item, at: new Date().toISOString() });
      }, FIGHT_MS),
    );
  }, [clearTimers, startFight, land]);

  /** 스페이스로 던지고 챈다. 낚시 중엔 이동 키가 필요 없다. */
  useEffect(() => {
    if (stage === "away") return;
    const onKey = (event: KeyboardEvent) => {
      // 채팅을 치는 동안 Space 가 낚싯대를 휘두르면 안 된다.
      if (isTypingTarget(event)) return;
      if (event.key === "Escape") {
        leave();
        return;
      }
      if (event.key !== " " && event.key !== "Enter") return;
      event.preventDefault();
      event.stopPropagation();
      if (stage === "bite") reel();
      else if (stage === "ready" || stage === "missed" || stage === "caught") {
        cast();
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [stage, cast, reel, leave]);

  if (stage === "away") return null;

  return (
    <div className="-translate-x-1/2 pointer-events-none fixed bottom-24 left-1/2 z-20 flex flex-col items-center gap-3">
      {caught && stage === "caught" && <CatchCard />}

      <div className="pointer-events-auto flex items-center gap-2">
        <Prompt stage={stage} onCast={cast} onReel={reel} />
        <button
          type="button"
          onClick={leave}
          className={`${SIGN} ${CHUNKY} px-3.5 py-2 font-bold text-[13px]`}
        >
          {t().fishing.quit}
        </button>
      </div>
    </div>
  );
}

function Prompt({
  stage,
  onCast,
  onReel,
}: {
  stage: FishingStage;
  onCast: () => void;
  onReel: () => void;
}) {
  if (stage === "casting") {
    return <Still text={t().fishing.casting} />;
  }
  if (stage === "waiting") {
    return <Still text={t().fishing.waiting} />;
  }
  if (stage === "fighting") {
    /**
     * 씨름하는 동안은 버튼이 아니라 **화면을 보라는 신호**다.
     * 여기서 누를 게 있으면 사람들은 물이 아니라 버튼을 본다.
     */
    return <Still text={t().fishing.fighting} />;
  }
  if (stage === "bite") {
    return (
      <button
        type="button"
        onClick={onReel}
        className={`${SIGN_ACCENT} ${CHUNKY} animate-pulse px-8 py-3 font-black text-[17px]`}
      >
        {t().fishing.now}
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
        ? t().fishing.missed
        : stage === "caught"
          ? t().fishing.again
          : t().fishing.cast}
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
 * 걸린 건 딱 두 가지다 — **꽝**, 그리고 아주 드물게 진짜 커피.
 * 그래서 꽝일 때는 크게 "꽝" 이라고 쓰고, 바로 아래에 확률 한 줄만 붙인다.
 * 뭘 노리는지 모르면 한 번 던져보고 끝이고, 확률을 알면 한 번 더 던진다.
 */
function CatchCard() {
  const caught = useFishingStore((state) => state.caught);
  if (!caught) return null;
  const { item, at } = caught;
  const blank = item.tier !== "real";
  const copy =
    t().fishing.catchables[item.id as keyof Dict["fishing"]["catchables"]];

  return (
    <div
      className={`${SIGN} zoom-in w-[min(22rem,calc(100vw-2rem))] animate-in px-5 py-4 text-center`}
    >
      {blank && (
        <p className="font-black text-[13px] text-[#b08968] tracking-[0.3em]">
          {t().fishing.blank}
        </p>
      )}
      <span className="text-[40px] leading-none">{item.emoji}</span>
      <p className="mt-1 font-bold text-[17px] text-[#3a2a22]">{copy?.name}</p>
      <p className="mt-1 font-medium text-[13px] text-[#8a7460]">
        {copy?.blurb}
      </p>

      {blank ? (
        <p className="mt-3 rounded-xl bg-[#f3e8d6] px-3 py-2 font-semibold text-[12px] text-[#6b5442] leading-relaxed">
          ☕ {t().fishing.odds(REAL_CHANCE_PERCENT.toFixed(1))}
        </p>
      ) : (
        /**
         * 당첨. **이 화면 자체가 증표다.**
         *
         * 교환 코드도 없고 확인할 서버도 없다 — 캡처해서 보내면 주인장이 산다.
         * 위조할 수 있지 않냐면 그렇다. 커피 한 잔에 그럴 사람이면 사드리는 게 맞다.
         * 대신 시각을 박아둔다. 증표라기보다 **그날의 기록**에 가깝다.
         */
        <div className="mt-3 rounded-2xl bg-[#fff6ef] px-4 py-3">
          <p className="font-bold text-[11px] text-[#c2562f] tracking-widest">
            {t().fishing.couponTitle}
          </p>
          <p className="mt-1 font-medium text-[11px] text-[#8a7460] tabular-nums">
            {new Date(at).toLocaleString(currentLocale())}
          </p>
          <p className="mt-2 font-semibold text-[12px] text-[#5c4a3c] leading-relaxed">
            {t().fishing.couponHowTo(OWNER_CONTACT)}
          </p>
        </div>
      )}
    </div>
  );
}
