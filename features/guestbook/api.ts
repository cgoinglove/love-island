"use client";

import useSWRInfinite, { type SWRInfiniteResponse } from "swr/infinite";
import {
  type CreateGuestbookInput,
  type GuestbookEntry,
  type GuestbookPage,
  guestbookEntry,
  guestbookPage,
} from "@/shared/guestbook";

const ENDPOINT = "/api/guestbook";

function pageKey(room: string, cursor: string | null): string {
  const params = new URLSearchParams({ room });
  if (cursor) params.set("cursor", cursor);
  return `${ENDPOINT}?${params.toString()}`;
}

/** 서버 응답도 스키마로 다시 검증한다. 배포가 어긋나면 여기서 잡힌다. */
async function fetchPage(url: string): Promise<GuestbookPage> {
  const response = await fetch(url);
  if (!response.ok) throw new Error("방명록을 불러오지 못했습니다.");
  return guestbookPage.parse(await response.json());
}

export interface GuestbookFeed {
  entries: GuestbookEntry[];
  isLoading: boolean;
  isLoadingMore: boolean;
  hasMore: boolean;
  error: Error | undefined;
  loadMore(): void;
  refresh(): void;
}

/**
 * 무한 스크롤 피드.
 *
 * SWR 의 getKey 는 "직전 페이지"를 받는다. 거기 담긴 nextCursor 로 다음 키를 만들고,
 * null 이면 키를 만들지 않는다 — 그게 "끝"을 SWR 에게 알리는 방법이다.
 */
export function useGuestbookFeed(room: string): GuestbookFeed {
  const swr: SWRInfiniteResponse<GuestbookPage, Error> = useSWRInfinite<
    GuestbookPage,
    Error
  >(
    (index, previous) => {
      if (index === 0) return pageKey(room, null);
      if (!previous || previous.nextCursor === null) return null;
      return pageKey(room, previous.nextCursor);
    },
    fetchPage,
    {
      // 게임 화면은 포커스가 수시로 들락거린다. 그때마다 재검증하면 낭비다.
      revalidateOnFocus: false,
      revalidateFirstPage: false,
      dedupingInterval: 10_000,
    },
  );

  const pages = swr.data ?? [];
  const entries = pages.flatMap((page) => page.entries);
  const last = pages.at(-1);

  return {
    entries,
    isLoading: swr.isLoading,
    // 페이지를 더 요청했는데 아직 안 온 상태.
    isLoadingMore: swr.isValidating && pages.length < swr.size,
    hasMore: last ? last.nextCursor !== null : true,
    error: swr.error,
    loadMore: () => {
      void swr.setSize(swr.size + 1);
    },
    refresh: () => {
      void swr.mutate();
    },
  };
}

const ERROR_MESSAGES: Record<string, string> = {
  RATE_LIMITED: "조금 전에 이미 남기셨어요. 잠시 후에 다시 시도해주세요.",
  INVALID: "적어주신 내용을 다시 확인해주세요.",
  INVALID_JSON: "요청을 읽지 못했습니다.",
  INTERNAL: "섬에 문제가 생겼어요. 잠시 후 다시 시도해주세요.",
};

async function toError(response: Response): Promise<Error> {
  try {
    const body = (await response.json()) as { error?: string };
    return new Error(
      ERROR_MESSAGES[body.error ?? ""] ?? "쪽지를 남기지 못했습니다.",
    );
  } catch {
    return new Error("쪽지를 남기지 못했습니다.");
  }
}

/**
 * 쪽지를 남긴다.
 *
 * 저장만 하고 목록 갱신은 호출한 쪽의 feed.refresh() 에 맡긴다.
 *
 * 전역 mutate 로 "/api/guestbook 으로 시작하는 키" 를 무효화하려다 한 번 실패했다 —
 * useSWRInfinite 는 페이지 키를 그대로 캐시에 쓰지 않고 자기 방식으로 감싼다.
 * 그래서 문자열 패턴이 영영 안 맞고, 저장은 됐는데 목록만 그대로인 상태가 된다.
 */
export async function postGuestbookEntry(
  input: CreateGuestbookInput,
): Promise<GuestbookEntry> {
  const response = await fetch(ENDPOINT, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input),
  });
  if (!response.ok) throw await toError(response);
  return guestbookEntry.parse(await response.json());
}
