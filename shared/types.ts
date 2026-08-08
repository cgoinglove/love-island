/**
 * 프로젝트 전역 타입.
 *
 * shared/ 는 의존성 그래프의 잎(leaf)이다 — 아무것도 import 하지 않으며
 * 브라우저·워커·노드 어디서든 돌아간다. (biome.json 의 shared/** override 가 강제)
 */

declare const brand: unique symbol;

type Brand<T, B extends string> = T & { readonly [brand]: B };

/** 방 식별자. 그냥 string 이지만 아무 문자열이나 흘러들어오지 못한다. */
export type RoomId = Brand<string, "RoomId">;

/** 접속자 식별자. awareness clientID 와 1:1. */
export type PlayerId = Brand<string, "PlayerId">;

/**
 * 그리드 칸 번호(정수). 월드 좌표(미터)와 섞이면 조용히 틀린 위치로 간다.
 * 이 프로젝트에서 브랜딩이 실제로 버그를 막아주는 거의 유일한 자리라 여기만 엄격하게 쓴다.
 */
export type GridIndex = Brand<number, "GridIndex">;

/**
 * 아래 세 개는 "단위 규약을 코드로 적어둔다"는 목적의 문서용 타입이다.
 * 프레임마다 도는 시뮬레이션 코드에는 일부러 강제하지 않는다 —
 * 핫 루프에 생성자 호출을 끼워 넣으면 얻는 것 없이 노이즈만 늘어난다.
 */
/** 월드 길이. 1 three 유닛 = 1 미터. */
export type Meters = Brand<number, "Meters">;
/** 초 단위(부동소수). 시뮬레이션 시간은 전부 이 단위. */
export type Seconds = Brand<number, "Seconds">;
/** 밀리초 정수. 네트워크 타임스탬프에만 쓴다. */
export type Millis = Brand<number, "Millis">;

export const roomId = (value: string): RoomId => value as RoomId;
export const playerId = (value: string): PlayerId => value as PlayerId;
export const gridIndex = (value: number): GridIndex =>
  Math.trunc(value) as GridIndex;

/** three 의 Vector3 대신 쓰는 순수 튜플. 순수 로직 레이어는 three 를 모른다. */
export type Vec3 = readonly [x: number, y: number, z: number];

/** 지면 평면상의 좌표. 이 게임의 이동은 전부 XZ 평면에서 일어난다. */
export type Vec2XZ = readonly [x: number, z: number];

/** 그리드 한 칸. col 은 +X 방향, row 는 +Z 방향으로 증가한다. */
export interface GridCell {
  readonly col: GridIndex;
  readonly row: GridIndex;
}

/**
 * 그리드 정의. 맵마다 하나씩 갖고 다니며 순수 함수에 인자로 넘긴다.
 * 전역 싱글턴으로 두지 않는 이유: 테스트에서 3x3 짜리 미니 그리드를 만들 수 있어야 한다.
 */
export interface GridSpec {
  readonly cols: number;
  readonly rows: number;
  /** 한 칸의 한 변 길이(미터). */
  readonly cellSize: number;
  /** col 0 의 왼쪽 모서리에 해당하는 월드 X. */
  readonly originX: number;
  /** row 0 의 위쪽 모서리에 해당하는 월드 Z. */
  readonly originZ: number;
}
