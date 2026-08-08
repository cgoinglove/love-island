"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Panel } from "@/components/island/Panel";
import { CHUNKY, SIGN, SIGN_ACCENT } from "@/components/island/ui";
import { usePlayerController } from "@/game/core/playerControl";
import {
  isUnlocked,
  STAMP_GOAL,
  STAMPS,
  useStampStore,
} from "@/game/hud/stamps";
import { useHudStore } from "@/game/hud/store";
import { setNickname as rememberNickname } from "@/game/net/useNickname";
import {
  MESSAGE_MAX,
  NICKNAME_MAX,
  NICKNAME_STORAGE_KEY,
  ROOM_ISLAND,
} from "@/shared/constants";
import { createGuestbookInput, type GuestbookEntry } from "@/shared/guestbook";
import { postGuestbookEntry, useGuestbookFeed } from "./api";
import { GUESTBOOK_PANEL_ID } from "./constants";

/** 쪽지 강조색. 카드마다 달라야 "여러 사람이 남겼다"가 한눈에 읽힌다. */
function hashOf(id: string): number {
  let hash = 2166136261;
  for (let i = 0; i < id.length; i++) {
    hash ^= id.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return Math.abs(hash);
}

/**
 * 쪽지가 삐뚤게 꽂힌 각도(도).
 *
 * 전부 반듯하면 표(table)로 보이고, 무작위로 흔들면 어지럽다.
 * id 로 정하면 다시 열어도 같은 자리에 같은 각도로 있어서 "내 쪽지"를 다시 찾을 수 있다.
 */
function tiltFor(id: string): number {
  return ((hashOf(id) >> 8) % 100) / 100 - 0.5;
}

export function GuestbookPanel() {
  const isOpen = useHudStore(
    (state) => state.openPanelId === GUESTBOOK_PANEL_ID,
  );
  const closePanel = useHudStore((state) => state.closePanel);
  const controllerRef = usePlayerController();

  const feed = useGuestbookFeed(ROOM_ISLAND);

  const [nickname, setNickname] = useState("");
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [composing, setComposing] = useState(false);
  const earned = useStampStore((state) => state.earned);
  const unlocked = isUnlocked(earned);

  // 지난번에 쓴 이름을 꺼내온다. 두 번째 방문에 또 이름을 치게 하지 않는다.
  useEffect(() => {
    if (!isOpen) return;
    setNickname(
      (current) => current || localStorage.getItem(NICKNAME_STORAGE_KEY) || "",
    );
  }, [isOpen]);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setFormError(null);

    // 쪽지는 지금 서 있는 자리에 떨어진다. 이게 방명록을 "장소"로 만든다.
    const pose = controllerRef.current?.pose();
    const parsed = createGuestbookInput.safeParse({
      nickname,
      message,
      room: ROOM_ISLAND,
      posX: pose?.x ?? 0,
      posZ: pose?.z ?? 0,
    });

    if (!parsed.success) {
      setFormError(parsed.error.issues[0]?.message ?? "다시 확인해주세요.");
      return;
    }

    setSubmitting(true);
    try {
      await postGuestbookEntry(parsed.data);
      /**
       * ⚠ 이 폼에는 이름이 같은 useState 세터가 있다. 그냥 setNickname 으로
       *   부르면 로컬 상태만 바뀌고 localStorage 에는 아무것도 안 남는다 —
       *   타입이 (string) => void 로 같아서 컴파일러도 안 잡아준다.
       *   저장 + 이름표 갱신 이벤트까지 하는 건 이쪽이다.
       */
      rememberNickname(parsed.data.nickname);
      setMessage("");
      setComposing(false);
      // 첫 페이지부터 다시 읽는다. 무한 스크롤에서 낙관적으로 끼워 넣으면
      // 커서 경계에서 한 건이 밀려 사라진다.
      feed.refresh();
    } catch (submitError) {
      setFormError(
        submitError instanceof Error
          ? submitError.message
          : "쪽지를 남기지 못했습니다.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  /**
   * 쪽지 입력. 스크롤 밖 아래 띠에 고정된다 —
   * 게시판을 아무리 내려도 "나도 붙일 수 있다" 가 화면에서 안 사라져야 한다.
   */
  const composeArea = composing ? (
    <form onSubmit={handleSubmit}>
      <div className="flex flex-col gap-2 sm:flex-row">
        <input
          value={nickname}
          onChange={(event) => setNickname(event.target.value)}
          placeholder="이름"
          maxLength={NICKNAME_MAX}
          className="w-full rounded-xl border-2 border-[#d9c9a8] bg-[#fdf6e8] px-3.5 py-2.5 font-medium text-[15px] text-[#3a2a22] outline-none transition placeholder:text-[#a8967f] focus:border-[#e8734a] sm:w-40"
        />
        <div className="relative flex-1">
          <textarea
            // biome-ignore lint/a11y/noAutofocus: 사용자가 방금 "쪽지 쓰기"를 누른 직후다
            autoFocus
            value={message}
            onChange={(event) => setMessage(event.target.value)}
            placeholder="한 마디 남기고 가세요"
            rows={2}
            maxLength={MESSAGE_MAX}
            className="w-full resize-none rounded-xl border-2 border-[#d9c9a8] bg-[#fdf6e8] px-3.5 py-2.5 font-medium text-[15px] text-[#3a2a22] outline-none transition placeholder:text-[#a8967f] focus:border-[#e8734a]"
          />
          <span className="pointer-events-none absolute right-3 bottom-2.5 font-semibold text-[10px] text-[#a8967f] tabular-nums">
            {message.length}/{MESSAGE_MAX}
          </span>
        </div>
      </div>

      {formError && (
        <p className="mt-2 font-semibold text-[13px] text-[#c2432a]">
          {formError}
        </p>
      )}

      <div className="mt-3 flex gap-2">
        <button
          type="button"
          onClick={() => setComposing(false)}
          className={`px-4 py-2.5 font-bold text-[14px] ${SIGN} ${CHUNKY}`}
        >
          취소
        </button>
        <button
          type="submit"
          disabled={
            submitting ||
            message.trim().length === 0 ||
            nickname.trim().length === 0
          }
          className={`flex-1 py-2.5 font-bold text-[15px] ${SIGN_ACCENT} ${CHUNKY} disabled:cursor-not-allowed disabled:opacity-45`}
        >
          {submitting ? "남기는 중…" : "쪽지 남기기"}
        </button>
      </div>
    </form>
  ) : unlocked ? (
    <button
      type="button"
      onClick={() => setComposing(true)}
      className={`flex w-full items-center justify-center gap-2 py-3 font-bold text-[15px] ${SIGN_ACCENT} ${CHUNKY} hover:brightness-[1.05]`}
    >
      쪽지 붙이기
    </button>
  ) : (
    /**
     * 읽기는 열어두고 **쓰기만** 막는다. 남의 쪽지는 볼 수 있어야
     * "여기 사람들이 다녀갔구나" 가 전달되고, 그게 쓰고 싶게 만든다.
     */
    <div className="rounded-xl bg-[#f2e9d6] px-4 py-3 text-center">
      <p className="font-bold text-[14px] text-[#3a2a22]">
        쪽지를 붙이려면 도장 {STAMP_GOAL}개가 필요해요
      </p>
      <p className="mt-1 font-medium text-[12px] text-[#8a7460]">
        {STAMPS.filter((s) => !earned[s.id])
          .map((s) => s.hint)
          .join(" · ")}
      </p>
    </div>
  );

  return (
    <Panel
      open={isOpen}
      onClose={closePanel}
      slug="방명록 게시판"
      title="방명록"
      subtitle={
        feed.entries.length > 0
          ? `${feed.entries.length}${feed.hasMore ? "+" : ""}개의 쪽지 · 쓴 자리에 떨어집니다`
          : "쪽지는 지금 서 있는 자리에 떨어집니다"
      }
      /**
       * 코르크판이 화면을 통째로 덮는다. 3D 로 서 있는 게시판과 **같은 재료**여야
       * 걸어가서 연 화면이 다른 물건으로 안 보인다.
       * 점 두 겹으로 코르크 특유의 얼룩덜룩함을 만든다.
       */
      surfaceClassName="bg-[#d3a973] [background-image:radial-gradient(circle_at_30%_40%,rgba(120,80,40,0.20)_1.4px,transparent_1.6px),radial-gradient(circle_at_70%_75%,rgba(160,115,60,0.28)_1.1px,transparent_1.3px)] [background-size:17px_17px,11px_11px]"
      /**
       * 게시판만 제목을 가운데 폭에 안 가둔다. 쪽지가 화면 끝까지 벌어져야
       * "많이 붙어 있다" 가 보이는데, 제목만 안쪽으로 들어가 있으면 어긋나 보인다.
       */
      titleClassName="max-w-none"
      footer={
        <div className="border-[#4a3428]/25 border-t-2 bg-[#f6ecd8] px-5 pt-3 pb-[max(1rem,env(safe-area-inset-bottom))]">
          <div className="mx-auto w-full max-w-3xl">{composeArea}</div>
        </div>
      }
    >
      <Board feed={feed} />
    </Panel>
  );
}

/**
 * 게시판.
 *
 * 스크롤 위치를 재는 대신 바닥에 감시용 div 를 두고 IntersectionObserver 로 본다.
 * 스크롤 이벤트를 직접 듣는 것보다 싸고, 컨테이너 높이가 바뀌어도 알아서 맞는다.
 */
function Board({ feed }: { feed: ReturnType<typeof useGuestbookFeed> }) {
  const sentinelRef = useRef<HTMLDivElement>(null);
  const { hasMore, isLoadingMore, loadMore } = feed;

  const onIntersect = useCallback(
    (entries: IntersectionObserverEntry[]) => {
      if (!entries[0]?.isIntersecting) return;
      if (!hasMore || isLoadingMore) return;
      loadMore();
    },
    [hasMore, isLoadingMore, loadMore],
  );

  useEffect(() => {
    const node = sentinelRef.current;
    if (!node) return;
    // rootMargin 으로 바닥에 닿기 전에 미리 불러온다 — 끊김이 눈에 안 띈다.
    const observer = new IntersectionObserver(onIntersect, {
      rootMargin: "320px",
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, [onIntersect]);

  if (feed.isLoading) {
    return (
      <p className="px-5 py-16 text-center font-bold text-[14px] text-[#6b4a2a]">
        불러오는 중…
      </p>
    );
  }

  if (feed.error) {
    return (
      <p className="px-5 py-16 text-center font-bold text-[14px] text-[#8c2f1a]">
        방명록을 불러오지 못했습니다.
      </p>
    );
  }

  if (feed.entries.length === 0) {
    return (
      <div className="px-5 py-20 text-center">
        <p className="font-bold text-[16px] text-[#6b4a2a]">
          아직 아무도 다녀가지 않았어요.
        </p>
        <p className="mt-1.5 font-medium text-[13px] text-[#8a6540]">
          첫 쪽지를 붙여주세요
        </p>
      </div>
    );
  }

  return (
    /**
     * 코르크판 바탕은 Panel 이 화면 전체에 깐다(surfaceClassName).
     * 여기는 그 위에 쪽지를 벌여놓는 일만 한다.
     */
    <div className="px-5 pb-6 sm:px-8">
      {/*
        벽돌 쌓기(masonry). 글 길이가 제각각이라 격자로 놓으면 짧은 카드 아래가 텅 빈다.
        CSS columns 는 위→아래로 채우므로 시간순 읽기와 맞진 않지만,
        게시판은 "훑어보는" 화면이라 밀도가 순서보다 중요하다.

        전체화면이 되면서 넓은 모니터에서 단을 더 쓸 수 있게 됐다 — 예전엔 창 폭이
        네 단에서 막혔다. 쪽지가 한 화면에 많이 보이는 것 자체가 게시판의 인상이다.
      */}
      <div className="columns-1 gap-4 sm:columns-2 lg:columns-3 xl:columns-4 2xl:columns-5">
        {feed.entries.map((entry) => (
          <NoteCard key={entry.id} entry={entry} />
        ))}
      </div>

      <div ref={sentinelRef} className="h-8" />

      {isLoadingMore && (
        <p className="text-center font-bold text-[12px] text-[#6b4a2a]">
          더 불러오는 중…
        </p>
      )}
      {!hasMore && feed.entries.length > 6 && (
        <p className="text-center font-semibold text-[12px] text-[#6b4a2a]/60">
          여기까지예요
        </p>
      )}
    </div>
  );
}

/** 포스트잇 색. 3D 게시판에 붙어 있는 것과 같은 팔레트다. */
const NOTE_PAPERS = [
  { bg: "#ffe066", edge: "#e0bd3a" },
  { bg: "#ff9fb2", edge: "#e07689" },
  { bg: "#8ce0c0", edge: "#5fbf9a" },
  { bg: "#9fc8ff", edge: "#6fa2e0" },
  { bg: "#ffc48c", edge: "#e09c5c" },
  { bg: "#e3b8ff", edge: "#bf8fe0" },
];

function NoteCard({ entry }: { entry: GuestbookEntry }) {
  // 색을 못 고르는 경우는 없지만, 못 고르면 색이 빠지는 것보다 노란 종이가 낫다.
  const paper = NOTE_PAPERS[hashOf(entry.id) % NOTE_PAPERS.length] ?? {
    bg: "#ffe066",
    edge: "#e0bd3a",
  };
  const tilt = tiltFor(entry.id);

  return (
    <article
      className="group mb-4 break-inside-avoid pt-3"
      style={{ transform: `rotate(${tilt}deg)` }}
    >
      <div
        className="relative rounded-[3px] px-4 pt-4 pb-3.5 shadow-[0_6px_14px_-6px_rgba(60,35,15,0.65)] transition duration-200 group-hover:-translate-y-0.5 group-hover:shadow-[0_12px_22px_-8px_rgba(60,35,15,0.7)]"
        style={{
          backgroundColor: paper.bg,
          // 종이 아랫부분이 살짝 그늘지면 판에 붙어 있는 것처럼 보인다.
          backgroundImage: `linear-gradient(160deg, rgba(255,255,255,0.35), transparent 45%, ${paper.edge}55)`,
        }}
      >
        {/*
          압정. 카드 위로 걸치도록 음수 top 을 준다.
          이 점 하나가 "카드 목록"을 "핀으로 꽂은 게시판"으로 바꾼다.
        */}
        <span
          aria-hidden
          className="-top-[9px] -translate-x-1/2 absolute left-1/2 size-4 rounded-full ring-[2.5px] ring-[#00000033]"
          style={{
            background:
              "radial-gradient(circle at 32% 28%, #ffffff 0%, #e8734a 42%, #8c3d1e 100%)",
          }}
        />

        <div className="flex items-baseline justify-between gap-3">
          <span className="font-bold text-[14px] text-[#3a2a22]">
            {entry.nickname}
          </span>
          <time className="shrink-0 font-semibold text-[11px] text-[#3a2a22]/45">
            {formatDate(entry.createdAt)}
          </time>
        </div>

        <p className="mt-2 whitespace-pre-wrap break-words font-medium text-[15px] text-[#3a2a22]/85 leading-[1.65]">
          {entry.message}
        </p>

        <p className="mt-3 font-semibold text-[10px] text-[#3a2a22]/35">
          {entry.posX.toFixed(0)}, {entry.posZ.toFixed(0)} 에서
        </p>
      </div>
    </article>
  );
}

function formatDate(iso: string): string {
  const date = new Date(iso);
  const elapsed = Date.now() - date.getTime();
  const minutes = Math.floor(elapsed / 60_000);
  if (minutes < 1) return "방금";
  if (minutes < 60) return `${minutes}분 전`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}시간 전`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}일 전`;
  return date.toLocaleDateString("ko-KR", { month: "long", day: "numeric" });
}
