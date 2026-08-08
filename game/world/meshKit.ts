import {
  BufferAttribute,
  type BufferGeometry,
  Color,
  type ColorRepresentation,
} from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";

/**
 * 여러 조각을 **한 덩어리**로 굽는다.
 *
 * ── 왜 필요한가 ──
 * 색이 다르면 머티리얼이 달라지고, 머티리얼이 다르면 드로우콜이 갈라진다.
 * 게시판에 포스트잇 12장을 붙였더니 그것만으로 드로우콜이 36개 늘어서
 * 프레임 예산을 넘겼다 — 화면에 보이는 건 판때기 하나인데.
 *
 * 색을 **정점 속성**으로 구워 넣으면 조각이 몇 개든 머티리얼 하나로 그릴 수 있다.
 * 야자수(palmGeometry)가 같은 방식으로 그루당 드로우콜 1을 지킨다.
 *
 * ── 한계 ──
 * 정점 색은 확산광(diffuse)만 바꾼다. 발광·금속성처럼 재질 자체가 다른 조각은
 * 여기 섞을 수 없고 따로 그려야 한다.
 */
export interface Piece {
  geometry: BufferGeometry;
  color: ColorRepresentation;
  position?: readonly [number, number, number];
  /** 라디안. XYZ 순서로 돈다. */
  rotation?: readonly [number, number, number];
  scale?: readonly [number, number, number];
}

const scratch = new Color();

/**
 * 조각들을 변환·착색해 하나로 합친다.
 *
 * 넘긴 지오메트리는 여기서 소유권을 가져가 병합 후 정리한다 —
 * 조각은 임시 재료지 재사용할 물건이 아니다.
 */
export function mergeColored(pieces: readonly Piece[]): BufferGeometry {
  const prepared: BufferGeometry[] = [];

  /**
   * ⚠ 인덱스가 있는 것과 없는 것을 섞으면 mergeGeometries 가 실패한다.
   *
   * three 의 기본 도형들이 제각각이다 — Sphere·Cylinder·Box 는 인덱스가 있고
   * Icosahedron 은 없다. 로봇 머리에 다면체를 하나 넣었다가 봇이 통째로
   * 안 그려졌고, 콘솔에만 조용히 에러가 찍혔다.
   *
   * 하나라도 인덱스가 없으면 **전부 풀어서** 맞춘다. 반대 방향(인덱스 만들기)은
   * 정점 병합 판정이 필요해서 훨씬 비싸고, 여기서 얻을 게 없다.
   */
  const anyNonIndexed = pieces.some((piece) => piece.geometry.index === null);

  for (const piece of pieces) {
    let geometry = piece.geometry;
    if (anyNonIndexed && geometry.index !== null) {
      const flat = geometry.toNonIndexed();
      geometry.dispose();
      geometry = flat;
    }

    if (piece.scale) {
      geometry.scale(piece.scale[0], piece.scale[1], piece.scale[2]);
    }
    if (piece.rotation) {
      geometry.rotateX(piece.rotation[0]);
      geometry.rotateY(piece.rotation[1]);
      geometry.rotateZ(piece.rotation[2]);
    }
    if (piece.position) {
      geometry.translate(
        piece.position[0],
        piece.position[1],
        piece.position[2],
      );
    }

    // three 는 정점 색을 선형 공간으로 기대한다. Color 가 변환을 맡는다.
    scratch.set(piece.color);
    const count = geometry.attributes.position?.count ?? 0;
    const colors = new Float32Array(count * 3);
    for (let i = 0; i < count; i += 1) {
      colors[i * 3] = scratch.r;
      colors[i * 3 + 1] = scratch.g;
      colors[i * 3 + 2] = scratch.b;
    }
    geometry.setAttribute("color", new BufferAttribute(colors, 3));

    prepared.push(geometry);
  }

  const merged = mergeGeometries(prepared, false);
  for (const geometry of prepared) geometry.dispose();

  if (merged === null) {
    throw new Error(
      "지오메트리 병합 실패 — 조각들의 속성 구성이 서로 다릅니다(인덱스 유무 등).",
    );
  }
  return merged;
}
