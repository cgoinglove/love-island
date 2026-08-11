"use client";

/**
 * 접속 상태를 콘솔에 남긴다. **프로덕션에서도** 찍힌다.
 *
 * ── 왜 개발 전용이 아닌가 ──
 * 이 앱에서 "느리다" 는 대부분 **P2P 가 안 붙어서 폴링으로 도는 것**인데,
 * 그게 되는지 안 되는지는 망을 타서 로컬에서는 재현이 안 된다. 같은 기계의
 * 두 탭은 NAT 이 없어 언제나 붙는다 — 로컬에서는 항상 초록불이다.
 *
 * 배포된 걸 실제 망에서 열어봐야 알 수 있고, 그러려면 그 자리에서 읽히는
 * 흔적이 있어야 한다. 화면 구석의 `p2p` 배지는 지금 상태만 보여주지
 * **언제 무엇이 실패했는지**는 못 보여준다.
 *
 * 대신 양을 엄격히 지킨다 — 상태가 바뀔 때 한 줄, 그리고 10초에 한 번 요약.
 */

const BADGE =
  "background:#e8734a;color:#fff6ef;padding:1px 6px;border-radius:4px;font-weight:700";
const DIM = "color:#8a7460";

function line(message: string, style = DIM): void {
  console.info(`%c러브 아일랜드%c ${message}`, BADGE, style);
}

/** 새 사람을 발견했다. 여기서부터 악수가 시작된다. */
export function logPeerFound(peerId: string): void {
  line(`👋 ${short(peerId)} 발견 — P2P 시도`);
}

/** 데이터채널이 열렸다. 이제 좌표는 서버를 안 거친다. */
export function logDirect(peerId: string, elapsedMs: number): void {
  line(
    `✅ ${short(peerId)} P2P 연결 (악수 ${(elapsedMs / 1000).toFixed(1)}초) — 좌표가 서버를 안 거칩니다`,
    "color:#2f6f4f;font-weight:600",
  );
}

/**
 * 못 붙었다. 폴링이 계속 좌표를 나른다.
 *
 * 실패 자체는 정상이다 — symmetric NAT(모바일 통신망·회사망) 뒤에서는 TURN 릴레이가
 * 있어야 뚫리는데 그건 대역폭 비용이라 안 뒀다. 다만 **왜 느린지는 알 수 있어야 한다.**
 */
export function logFallback(peerId: string, reason: string): void {
  line(
    `⚠️ ${short(peerId)} P2P 실패 (${reason}) — 폴링 폴백으로 돕니다 (200ms + 보간 320ms)`,
    "color:#b8512c;font-weight:600",
  );
}

export function logPeerGone(peerId: string): void {
  line(`🚪 ${short(peerId)} 나감`);
}

export interface NetSummary {
  /** 보이는 사람 수. */
  peers: number;
  /** 그중 P2P 로 붙은 수. */
  direct: number;
  /** 지금 쓰는 폴링 간격(ms). */
  intervalMs: number;
  /** 최근 presence 왕복(ms). */
  rttMs: number;
}

/**
 * 10초에 한 번 요약. 아무도 없으면 안 찍는다 — 혼자 노는 사람의 콘솔을 더럽힐 이유가 없다.
 *
 * 숫자 셋이 함께 있어야 진단이 된다. 폴링 간격이 200ms 인데 사람이 있다면 그건
 * **폴백으로 돌고 있다는 뜻**이고, 3000ms 라면 좌표가 P2P 로 가고 있다는 뜻이다.
 */
export function logSummary(summary: NetSummary): void {
  const transport =
    summary.direct === summary.peers
      ? `P2P ${summary.direct}명`
      : `P2P ${summary.direct}명 · 폴링 ${summary.peers - summary.direct}명`;
  line(
    `📡 ${transport} | 폴링 주기 ${summary.intervalMs}ms | 서버 왕복 ${summary.rttMs}ms`,
  );
}

/** 로그가 길어지지 않게 앞자리만. 어차피 구분만 되면 된다. */
function short(peerId: string): string {
  return peerId.slice(0, 8);
}
