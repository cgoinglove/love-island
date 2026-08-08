import {
  insertGuestbookEntry,
  listGuestbookPage,
} from "@/server/db/queries/guestbook";
import { checkGuestbookRateLimit, hashIp } from "@/server/ratelimit";
import { GUESTBOOK_PAGE_SIZE, ROOM_ISLAND } from "@/shared/constants";
import { createGuestbookInput } from "@/shared/guestbook";

/**
 * Route Handler 가 하는 일은 셋뿐이다: 검증 → 위임 → 직렬화.
 * SQL 이 여기 들어오는 순간 이 파일은 HTTP 없이 테스트할 수 없게 된다. (기획서 §6.2)
 */

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const room = params.get("room") ?? ROOM_ISLAND;
  const cursor = params.get("cursor");
  const limit = Math.min(
    Math.max(Number(params.get("limit")) || GUESTBOOK_PAGE_SIZE, 1),
    50,
  );

  try {
    const page = await listGuestbookPage(room, cursor, limit);
    return Response.json(page);
  } catch (error) {
    console.error("[guestbook] 목록 조회 실패", error);
    return Response.json({ error: "INTERNAL" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "INVALID_JSON" }, { status: 400 });
  }

  const parsed = createGuestbookInput.safeParse(body);
  if (!parsed.success) {
    return Response.json(
      {
        error: "INVALID",
        issues: parsed.error.issues.map((issue) => ({
          path: issue.path.join("."),
          message: issue.message,
        })),
      },
      { status: 400 },
    );
  }

  try {
    const ipHash = hashIp(request);
    const limit = await checkGuestbookRateLimit(ipHash);
    if (!limit.allowed) {
      return Response.json({ error: "RATE_LIMITED" }, { status: 429 });
    }

    const entry = await insertGuestbookEntry(parsed.data, ipHash);
    return Response.json(entry, { status: 201 });
  } catch (error) {
    console.error("[guestbook] 저장 실패", error);
    return Response.json({ error: "INTERNAL" }, { status: 500 });
  }
}
