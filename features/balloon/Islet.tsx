"use client";

import { useMemo } from "react";
import {
  type BufferGeometry,
  ConeGeometry,
  CylinderGeometry,
  SphereGeometry,
} from "three";
import { CurvedMaterial } from "@/game/world/curvature";
import { mergeColored, type Piece } from "@/game/world/meshKit";
import { ISLET_CENTER, ISLET_RADIUS } from "./constants";

/**
 * 열기구가 갔다 오는 **앞바다의 작은 섬**.
 *
 * ── 왜 진짜 섬이어야 하나 ──
 * 수평선의 큰 섬들(game/world/SeaLife)은 옆선을 얇게 밀어낸 **판때기**다.
 * 170m 밖에서는 그걸로 충분하지만 — 거기서는 윤곽선 하나가 전부다 — 열기구를
 * 타면 그 옆 17m 까지 다가가서 한 바퀴 돈다. 그 거리에서는 두께도 뒷면도
 * 다 보이므로, 갈 수 있는 섬은 **사방이 있는 물건**이어야 한다.
 *
 * ── 걸어다닐 수는 없다 ──
 * 통행 격자에 넣지 않았다. 기구는 하늘에서 돌기만 하고 내리는 곳은 계류장이라,
 * 여기에 발이 닿는 순간은 없다. 격자에 넣으면 섬 하나를 위해 격자를 두 배로
 * 넓혀야 하는데 그건 걸어갈 수 없는 땅에 치르는 값으로 너무 비싸다.
 */
function buildIslet(): BufferGeometry {
  const SAND = "#e6d3a4";
  const GRASS = "#79a95c";
  const ROCK = "#a2947f";
  const TRUNK = "#8a6440";
  const FROND = "#3f8f52";
  const FROND_DARK = "#33774a";

  /** 반구. 눌러서 쓰면 물에 잠긴 둔덕이 된다. */
  const dome = (radius: number) =>
    new SphereGeometry(radius, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2);

  const pieces: Piece[] = [
    // 모래톱. 넓고 얕게 — 물가가 완만해야 섬이 물에 **잠겨** 보인다.
    {
      geometry: dome(ISLET_RADIUS),
      color: SAND,
      scale: [1, 0.2, 0.92],
      position: [0, -0.35, 0],
    },
    /**
     * 풀 언덕.
     *
     * ⚠ 처음엔 이것도 납작하게 눌러 놨더니 섬 전체가 **팬케이크**였다.
     *   위에서 내려다보는 놀이기구라 옆선이 아니라 **높이 차**가 형태를 만든다 —
     *   모래는 얕게, 풀은 봉긋하게 해야 두 층이 구분된다.
     */
    {
      geometry: dome(ISLET_RADIUS * 0.58),
      color: GRASS,
      scale: [1.05, 0.62, 0.95],
      position: [0.4, 0.1, -0.3],
    },
  ];

  // 물가의 바위. 풀밭 밖에 둬야 보인다 — 안에 두면 언덕에 묻힌다.
  for (const [rx, rz, size] of [
    [-8.2, 2.4, 1.2],
    [6.6, 6.2, 0.9],
    [8.4, -4.2, 1.05],
    [-3.4, -8.2, 0.8],
  ] as const) {
    pieces.push({
      geometry: new SphereGeometry(size, 6, 4),
      color: ROCK,
      scale: [1, 0.55, 0.8],
      position: [rx, 0.15, rz],
    });
  }

  /**
   * 야자수 둘.
   *
   * ⚠ 5m 밖에 안 떨어뜨려 놨더니 두 그루의 잎이 겹쳐 **초록 덩어리 하나**가
   *   됐다 — 위에서 내려다보면 두 그루인지 한 그루인지 구분이 안 된다.
   *   잎 폭(2m)의 네 배는 떨어져야 두 그루로 읽힌다.
   *
   * ⚠ 큰 섬의 야자수를 재사용하지 않는다. 저건 발밑에서 올려다보는 물건이라
   *   잎이 여덟 장에 마디까지 있는데, 여기는 가장 가까워도 17m 밖이라
   *   그 디테일이 한 픽셀도 안 된다. 대신 **잎이 늘어져야** 야자수로 읽힌다 —
   *   위로 뻗으면 그건 소나무다.
   */
  for (const [tx, tz, lean, height] of [
    [-4.6, 1.8, 0.13, 6.2],
    [4.4, -2.2, -0.17, 5.4],
  ] as const) {
    pieces.push({
      geometry: new CylinderGeometry(0.26, 0.46, height, 6),
      color: TRUNK,
      rotation: [0, 0, lean],
      position: [tx, 1.4 + height / 2, tz],
    });
    const crown = 1.4 + height + Math.sin(lean) * 0.4;
    for (const [index, turn] of [0, 1.26, 2.51, 3.77, 5.03].entries()) {
      pieces.push({
        geometry: new ConeGeometry(0.62, 3.4, 4),
        color: index % 2 === 0 ? FROND : FROND_DARK,
        scale: [1, 1, 0.42],
        // 옆으로 눕히고 끝을 아래로 늘어뜨린다.
        rotation: [Math.PI / 2 - 0.35, 0, turn],
        position: [
          tx + Math.cos(turn) * 1.5 + lean * height * 0.5,
          crown - 0.2,
          tz + Math.sin(turn) * 1.5,
        ],
      });
    }
  }

  return mergeColored(pieces);
}

export function Islet() {
  const geometry = useMemo(buildIslet, []);
  return (
    <mesh
      geometry={geometry}
      position={[ISLET_CENTER[0], 0, ISLET_CENTER[1]]}
      castShadow
      receiveShadow
    >
      <CurvedMaterial vertexColors roughness={0.85} />
    </mesh>
  );
}
