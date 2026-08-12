/**
 * DataChannel 로 흘려보낼 좌표의 바이너리 표현.
 *
 * JSON 으로 보내면 `{"x":1.2345,"z":-3.4,"yaw":0.78}` 가 40바이트쯤 된다.
 * 16비트 고정소수점으로 양자화하면 **6바이트**다. 초당 20번 × 접속자 수만큼
 * 곱해지는 값이라, 이 차이가 모바일 데이터 요금에 그대로 나타난다. (기획서 §5.3)
 *
 * 정밀도는 1mm 남짓이다. 캐릭터 반지름이 35cm 인 게임에서 1mm 는 이미 과하다.
 *
 * three 도 react 도 모르는 순수 함수라 vitest 로 왕복을 검증한다.
 */

/** 좌표 한 세트의 바이트 수: x(2) + z(2) + yaw(2) + y(2) */
export const POSE_BYTES = 8;

/** 섬이 반지름 17m 라 ±32m 면 넉넉하다. 이 범위를 넘는 값은 잘린다. */
/**
 * 실어 나를 수 있는 좌표(±m).
 *
 * ⚠ shared/presence 의 x·z 상한과 **같은 숫자**여야 한다. 32 였을 땐 섬이
 *   반지름 40 이라 이미 아슬아슬했고, 세 배로 키운 뒤에는 섬 절반이 통째로
 *   범위 밖이 된다 — P2P 로만 위치가 잘려서 **남의 화면에서만 그 사람이
 *   섬 가장자리에 붙어 있는** 그림이 나온다.
 *   정밀도는 120/32767 = 4mm 라 넓혀도 잃는 게 없다.
 */
const POSITION_RANGE = 120;
const POSITION_SCALE = 32767 / POSITION_RANGE;
const YAW_SCALE = 32767 / Math.PI;

/**
 * 지면 위 높이(m)의 범위.
 *
 * ⚠ 이게 없어서 **남의 점프와 넉백이 안 보였다.** 패킷에 x·z·yaw 만 실려 있었고,
 *   받는 쪽은 그 좌표의 지면 높이에 캐릭터를 붙여놨다. 그래서 상대는 점프해도
 *   땅에 붙어 미끄러졌고, 밀쳐져 날아가는 포물선도 통째로 사라졌다.
 *   본인 화면에서는 멀쩡히 뜨니 "싱크가 안 맞는다" 로 보인다.
 *
 * 점프 정점이 1.8m, 넉백 정점이 0.6m 다. 8m 면 넉넉하고 정밀도는 0.25mm 다.
 */
/**
 * 실어 나를 수 있는 높이(±m).
 *
 * ⚠ shared/presence 의 presenceBeat.y 상한과 **같은 숫자**여야 한다. 8 이었을 땐
 *   열기구(26m)를 탄 사람이 P2P 로는 8m 에서 잘리고 폴백으로는 제 높이로 와서,
 *   보는 사람마다 다른 높이에 떠 있었다.
 *   정밀도는 40/32767 = 1.2mm 라 넓혀도 잃는 게 없다.
 */
const HEIGHT_RANGE = 40;
const HEIGHT_SCALE = 32767 / HEIGHT_RANGE;

/**
 * int16 의 범위는 -32768 ~ 32767 로 비대칭이다.
 * -32768 까지 허용하면 복호화했을 때 -32.001m 이 나와서 "±32m 안"이라는 약속이 깨진다.
 * 값 하나를 버리고 대칭으로 자른다.
 */
function clampToInt16(value: number): number {
  return Math.max(-32767, Math.min(32767, Math.round(value)));
}

export function encodePose(
  view: DataView,
  x: number,
  z: number,
  yaw: number,
  y: number,
): void {
  view.setInt16(0, clampToInt16(x * POSITION_SCALE), true);
  view.setInt16(2, clampToInt16(z * POSITION_SCALE), true);
  view.setInt16(4, clampToInt16(wrapYaw(yaw) * YAW_SCALE), true);
  view.setInt16(6, clampToInt16(y * HEIGHT_SCALE), true);
}

export interface DecodedPose {
  x: number;
  z: number;
  yaw: number;
  /** 지면 위 높이(m). 0 이면 땅에 붙어 있다. */
  y: number;
}

/** out 을 제자리에서 채운다. 초당 수십 번 도는 경로라 객체를 새로 만들지 않는다. */
export function decodePose(view: DataView, out: DecodedPose): void {
  out.x = view.getInt16(0, true) / POSITION_SCALE;
  out.z = view.getInt16(2, true) / POSITION_SCALE;
  out.yaw = view.getInt16(4, true) / YAW_SCALE;
  out.y = view.getInt16(6, true) / HEIGHT_SCALE;
}

/**
 * yaw 를 [-π, π] 로 접는다.
 * coords.ts 의 wrapAngle 을 쓰지 않는 이유: 여기는 game/net 이고 game/core 를 끌어오면
 * 이 파일이 좌표계 규약에 묶인다. 6줄짜리 함수라 독립으로 두는 편이 싸다.
 */
function wrapYaw(angle: number): number {
  const twoPi = Math.PI * 2;
  const shifted = (angle + Math.PI) % twoPi;
  return (shifted < 0 ? shifted + twoPi : shifted) - Math.PI;
}
