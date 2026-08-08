"use client";

import { useMemo } from "react";
import { PlaneGeometry } from "three";
import { CurvedMaterial } from "@/game/world/curvature";
import { SHALLOW_SAND } from "@/game/world/Terrain";

/**
 * 먼바다 바닥.
 *
 * ── 왜 필요한가 ──
 * 지형은 80×80 **정사각 판**이다. 그 바깥은 아무것도 없어서, 반투명한 물 너머로
 * 판이 뚝 끊기는 직선이 보였다 — 섬 주위에 사각형이 그려진 것처럼.
 *
 * 물을 불투명하게 만들어 가릴 수도 있었지만, 그러면 물가의 모래톱이 비쳐 보이는
 * 지금의 투명한 얕은 물을 잃는다. 안 보이게 덮는 대신 **실제로 바닥을 이어 붙인다.**
 *
 * ── 왜 이음매가 안 보이는가 ──
 * elevationAt 은 해안에서 8m 만 나가면 -2.6 으로 포화된다. 즉 지형 판의 바깥 테두리는
 * 이미 전부 평평한 -2.6 이다. 여기를 같은 높이·같은 색으로 맞추면 두 면이 한 평면이 되어
 * 경계가 사라진다. 지형과 같은 곡률 셰이더를 쓰므로 멀리서 휘는 정도도 똑같다.
 */

/** 지형의 먼바다 포화 높이. island.ts 의 -smoothstep(0,8,d)*2.6 과 같은 값이다. */
const FLOOR_Y = -2.6;

/** 바다 판(420)보다 넉넉히 크게. 수평선 너머까지 바닥이 있어야 틈이 안 생긴다. */
const SIZE = 520;

/**
 * 곡률은 정점에서만 계산되므로 면이 크면 사이가 직선으로 잘린다.
 * 세그먼트를 충분히 줘야 바다와 같은 곡선으로 휘어 내려간다.
 */
const SEGMENTS = 64;

export function Seafloor() {
  const geometry = useMemo(() => {
    const plane = new PlaneGeometry(SIZE, SIZE, SEGMENTS, SEGMENTS);
    // 메시가 아니라 지오메트리를 눕힌다 — 메시를 회전시키면 곡률이 옆으로 밀린다.
    plane.rotateX(-Math.PI / 2);
    return plane;
  }, []);

  return (
    // 지형보다 먼저 그려 겹치는 구간에서 지형이 이기게 한다.
    <mesh geometry={geometry} position={[0, FLOOR_Y, 0]} renderOrder={-2}>
      {/*
        지형에서 색을 **가져온다**. 베껴 적으면 한쪽만 바뀌는 날이 오고,
        그날 물 밑에 사각형이 다시 나타난다.
      */}
      <CurvedMaterial color={SHALLOW_SAND} roughness={1} />
    </mesh>
  );
}
