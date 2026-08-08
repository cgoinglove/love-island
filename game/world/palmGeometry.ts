import { BufferAttribute, BufferGeometry, SphereGeometry } from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";

/**
 * 야자수 한 그루 전체를 지오메트리 하나로 굽는다.
 *
 * 전에는 기둥 마디 4개 + 잎 18개 + 코코넛을 전부 개별 메시로 뒀다.
 * 그루당 드로우콜 23개였고, 잎이 납작한 상자라 X 자 프로펠러처럼 보였다.
 *
 * 여기서는
 *  - 기둥: 곡선을 따라 반지름이 줄어드는 링을 이어붙인 튜브 (마디 없는 곡선)
 *  - 잎: 처지는 곡선을 따라 폭이 좁아지고 가운데가 접힌 스트립 (진짜 잎 실루엣)
 *  - 코코넛: 구 세 개
 * 를 전부 버텍스 컬러로 칠해 **메시 하나**로 합친다. 그루당 드로우콜 1.
 */

const TRUNK_RINGS = 13;
const TRUNK_SIDES = 7;
const TRUNK_HEIGHT = 10.5;
const TRUNK_LEAN = 3.0;

function buildTrunk(): BufferGeometry {
  const positions: number[] = [];
  const colors: number[] = [];
  const indices: number[] = [];

  for (let ring = 0; ring < TRUNK_RINGS; ring++) {
    const t = ring / (TRUNK_RINGS - 1);
    // 위로 갈수록 많이 기운다 — t² 곡선이라 밑동은 곧고 끝만 휜다.
    const centerX = TRUNK_LEAN * t * t;
    const centerY = TRUNK_HEIGHT * t;
    const radius = 0.44 - 0.22 * t;
    // 위로 갈수록 밝아진다. 단색 기둥은 플라스틱 파이프로 보인다.
    const shade = 0.74 + 0.26 * t;

    for (let side = 0; side < TRUNK_SIDES; side++) {
      const angle = (side / TRUNK_SIDES) * Math.PI * 2;
      positions.push(
        centerX + Math.cos(angle) * radius,
        centerY,
        Math.sin(angle) * radius,
      );
      colors.push(0.58 * shade, 0.45 * shade, 0.32 * shade);
    }
  }

  for (let ring = 0; ring < TRUNK_RINGS - 1; ring++) {
    for (let side = 0; side < TRUNK_SIDES; side++) {
      const a = ring * TRUNK_SIDES + side;
      const b = ring * TRUNK_SIDES + ((side + 1) % TRUNK_SIDES);
      const c = a + TRUNK_SIDES;
      const d = b + TRUNK_SIDES;
      indices.push(a, c, b, b, c, d);
    }
  }

  const geometry = new BufferGeometry();
  geometry.setAttribute(
    "position",
    new BufferAttribute(new Float32Array(positions), 3),
  );
  geometry.setAttribute(
    "color",
    new BufferAttribute(new Float32Array(colors), 3),
  );
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

/** 잎 하나: 길이 방향 세그먼트마다 [가운데, 왼끝, 오른끝] 세 점을 놓은 접힌 스트립. */
function buildFrond(
  yaw: number,
  droop: number,
  length: number,
  tint: number,
): BufferGeometry {
  const SEGMENTS = 8;
  const reach = 5.2 * length;
  const positions: number[] = [];
  const colors: number[] = [];
  const indices: number[] = [];

  const dirX = Math.cos(yaw);
  const dirZ = Math.sin(yaw);
  const sideX = -dirZ;
  const sideZ = dirX;

  for (let i = 0; i <= SEGMENTS; i++) {
    const t = i / SEGMENTS;
    const along = reach * t;
    // 살짝 올라갔다가 끝으로 갈수록 처진다. 이 곡선이 잎의 전부다.
    const lift = 0.8 * Math.sin(Math.min(t * 2.0, Math.PI * 0.5));
    const fall = droop * 3.4 * t * t;
    const height = lift - fall;
    // 폭은 중간이 가장 넓고 끝은 뾰족하다.
    const width =
      (0.62 * Math.sin(Math.PI * Math.min(t + 0.12, 1)) + 0.02) * length;
    // 가운데 접힘 — 양끝이 아래로 꺾여야 "잎맥"이 생긴다.
    const fold = width * 0.55;

    const green = 0.52 + 0.18 * tint - t * 0.16;
    positions.push(dirX * along, height, dirZ * along);
    colors.push(0.15, green + 0.06, 0.24);
    positions.push(
      dirX * along + sideX * width,
      height - fold,
      dirZ * along + sideZ * width,
    );
    colors.push(0.13, green, 0.21);
    positions.push(
      dirX * along - sideX * width,
      height - fold,
      dirZ * along - sideZ * width,
    );
    colors.push(0.13, green, 0.21);
  }

  for (let i = 0; i < SEGMENTS; i++) {
    const a = i * 3;
    indices.push(a, a + 3, a + 1, a + 1, a + 3, a + 4);
    indices.push(a, a + 2, a + 3, a + 2, a + 5, a + 3);
  }

  const geometry = new BufferGeometry();
  geometry.setAttribute(
    "position",
    new BufferAttribute(new Float32Array(positions), 3),
  );
  geometry.setAttribute(
    "color",
    new BufferAttribute(new Float32Array(colors), 3),
  );
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

function buildCoconut(offsetX: number, offsetZ: number): BufferGeometry {
  const sphere = new SphereGeometry(0.24, 8, 6);
  sphere.translate(offsetX, -0.26, offsetZ);
  // merge 는 모든 지오메트리의 속성 집합이 같아야 한다. uv 를 버리고 color 를 채운다.
  sphere.deleteAttribute("uv");
  const count = sphere.getAttribute("position").count;
  const colors = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    colors[i * 3] = 0.42;
    colors[i * 3 + 1] = 0.3;
    colors[i * 3 + 2] = 0.18;
  }
  sphere.setAttribute("color", new BufferAttribute(colors, 3));
  return sphere;
}

/** 잎 배치. 각도·처짐·길이를 손으로 흩뜨려야 조화(造花) 티가 안 난다. */
const FRONDS: ReadonlyArray<
  [yaw: number, droop: number, length: number, tint: number]
> = [
  [0.1, 0.5, 1.0, 0.9],
  [0.95, 0.72, 0.86, 0.3],
  [1.9, 0.44, 1.08, 0.7],
  [2.8, 0.68, 0.9, 0.1],
  [3.7, 0.52, 1.02, 1.0],
  [4.6, 0.75, 0.84, 0.4],
  [5.5, 0.47, 1.05, 0.6],
];

export function createPalmGeometry(): BufferGeometry {
  const crownX = TRUNK_LEAN;
  const crownY = TRUNK_HEIGHT + 0.12;

  const parts = [buildTrunk()];
  for (const [yaw, droop, length, tint] of FRONDS) {
    const frond = buildFrond(yaw, droop, length, tint);
    frond.translate(crownX, crownY, 0);
    parts.push(frond);
  }
  parts.push(buildCoconut(crownX + 0.32, 0.14));
  parts.push(buildCoconut(crownX - 0.2, -0.28));
  parts.push(buildCoconut(crownX + 0.03, 0.36));

  const merged = mergeGeometries(parts);
  for (const part of parts) part.dispose();
  if (!merged) throw new Error("야자수 지오메트리 병합 실패");
  return merged;
}
