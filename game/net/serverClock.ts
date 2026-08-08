/**
 * 서버 시각 보정.
 *
 * ── 왜 필요한가 ──
 * 하루 순환을 epoch 시각으로 돌리면 아무것도 주고받지 않아도 모두가 같은 시간대를 본다.
 * 다만 그건 **각자의 시계가 맞다는 전제** 위에 서 있다. 시계가 몇 분씩 어긋난 기기는
 * 혼자 밤이고 나머지는 낮인 화면을 보게 된다.
 *
 * ── 왜 이 방법인가 ──
 * presence 요청은 이미 몇 초에 한 번씩 오간다. 그 응답의 `Date` 헤더가 곧 서버 시각이라,
 * **새 요청을 하나도 늘리지 않고** 보정값을 얻을 수 있다. 시간 동기화 전용 통로를
 * 파는 건 3분짜리 낮밤 주기에 과한 일이다.
 *
 * ── 정확도 ──
 * Date 헤더는 1초 단위고 왕복 지연도 안 빼준다. 즉 오차가 1~2초쯤 남는다.
 * 180초 주기에서 2초는 1% — 눈에 안 보인다. 그 이상 정밀하게 맞출 이유가 없다.
 */

let offsetMs = 0;

/**
 * 이만큼 어긋나야 보정한다.
 *
 * 왕복 지연과 헤더의 1초 해상도 때문에 매번 몇백 ms 씩 다르게 나온다.
 * 그 잡음을 그대로 따라가면 보정값이 끊임없이 흔들려 하늘이 미세하게 떨린다.
 * 시계가 정말 틀어졌을 때만 손대는 게 맞다.
 */
const DEADBAND_MS = 2500;

/**
 * 응답의 Date 헤더로 시계를 맞춘다.
 *
 * 헤더가 없거나 못 읽으면 아무것도 안 한다 — 보정을 못 하는 것보다
 * 엉뚱한 값으로 보정하는 게 나쁘다.
 */
export function noteServerTime(header: string | null): void {
  if (!header) return;

  const serverMs = Date.parse(header);
  if (!Number.isFinite(serverMs)) return;

  const candidate = serverMs - Date.now();
  if (Math.abs(candidate - offsetMs) < DEADBAND_MS) return;

  offsetMs = candidate;
}

/** 서버 기준 현재 시각(ms). 보정값이 없으면 로컬 시계 그대로다. */
export function serverNow(): number {
  return Date.now() + offsetMs;
}

/** 지금 적용 중인 보정값(ms). 진단용. */
export function clockOffsetMs(): number {
  return offsetMs;
}

/** 테스트에서 상태를 되돌린다. */
export function resetServerClock(): void {
  offsetMs = 0;
}
