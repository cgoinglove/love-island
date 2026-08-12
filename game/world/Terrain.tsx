"use client";

import { useMemo } from "react";
import {
  BufferAttribute,
  Color,
  DoubleSide,
  MeshStandardMaterial,
  PlaneGeometry,
} from "three";
import CustomShaderMaterial from "three-custom-shader-material";
import "@/game/core/bvh";
import { gridExtent } from "@/game/core/coords";
import { elevationAt, GRASS_LEVEL } from "@/game/core/island";
import { ISLAND_GRID } from "@/shared/constants";
import { CURVED_VERTEX } from "./shaders";

/**
 * 지형 해상도. 136m 를 200 칸으로 나누면 칸당 0.7m.
 *
 * 언덕은 파장이 24m 라 이보다 훨씬 성겨도 되지만, **물가의 경사**가 3.4m 안에서
 * 끝나므로 거기가 기준이다 — 칸이 1.5m 를 넘으면 해안선이 톱니처럼 각지고,
 * 물거품이 그 선을 따라 그려지므로 톱니가 그대로 드러난다.
 *
 * ⚠ 섬을 세 배로 키우면서 한 번 384 까지 올렸다가 되돌렸다. 정점 15만 개는
 *   메시 하나여도 폰에서 부담이고, 0.7m 와 0.9m 는 화면에서 구분이 안 된다.
 */
const SEGMENTS = 200;

/**
 * 모래 · 잔디 팔레트.
 *
 * 색 하나씩으로 칠하면 플라스틱처럼 보인다. 실제 해변은 **젖은 모래 → 마른 모래**,
 * 잔디는 **골짜기 → 능선**으로 색이 계속 바뀐다. 그 두 축을 각각 두 색으로 잡고
 * 높이로 섞으면, 텍스처 한 장 없이도 면이 살아난다.
 */
const SAND = new Color("#efdcb2");
/** 물기가 마르고 볕에 바랜 모래. 해변 위쪽. */
const SAND_DRY = new Color("#f7ecd0");
/**
 * 물에 잠긴 모래. 먼바다 바닥(Seafloor)이 이 색을 그대로 가져다 쓴다 —
 * 손으로 베껴 적으면 언젠가 한쪽만 바뀌고, 그 순간 물 밑에 사각형이 다시 드러난다.
 */
export const SHALLOW_SAND = new Color("#d6bd8b");
const GRASS = new Color("#86c25a");
const GRASS_DARK = new Color("#5f9440");
/** 능선의 볕 받는 잔디. 노랑기가 돌아야 초록 단색에서 벗어난다. */
const GRASS_SUN = new Color("#b3d96a");

const clamp01 = (value: number) => Math.min(1, Math.max(0, value));

function smoothstep(edge0: number, edge1: number, value: number): number {
  const t = clamp01((value - edge0) / (edge1 - edge0));
  return t * t * (3 - 2 * t);
}

export interface TerrainProps {
  curvature: number;
  /** 지면을 탭했을 때. 월드 좌표를 준다. */
  onTapGround?: (x: number, z: number) => void;
}

/**
 * 러브 아일랜드의 지형.
 *
 * 높이와 색을 island.ts 의 elevationAt 하나로 결정한다 — 네비 그리드도 같은 함수를 쓰므로
 * "보이는 땅"과 "걸을 수 있는 땅"이 정의상 어긋날 수 없다.
 */
export function Terrain({ curvature, onTapGround }: TerrainProps) {
  const geometry = useMemo(() => {
    const [width, depth] = gridExtent(ISLAND_GRID);
    const plane = new PlaneGeometry(width, depth, SEGMENTS, SEGMENTS);
    plane.rotateX(-Math.PI / 2);

    const position = plane.attributes.position as BufferAttribute;
    const colors = new Float32Array(position.count * 3);
    const sandTone = new Color();
    const grassTone = new Color();

    for (let i = 0; i < position.count; i++) {
      const x = position.getX(i);
      const z = position.getZ(i);
      const y = elevationAt(x, z);
      position.setY(i, y);

      /**
       * 모래: 물속 → 젖은 모래 → 마른 모래. 두 단계로 나눠야 물가에 띠가 생긴다.
       * 한 번에 섞으면 해변 전체가 같은 색이라 어디가 물가인지 안 보인다.
       */
      sandTone.copy(SHALLOW_SAND).lerp(SAND, clamp01((y + 1.4) / 1.6));
      sandTone.lerp(SAND_DRY, smoothstep(0.25, 0.95, y));

      // 잔디: 골짜기 → 평지 → 볕 받는 능선.
      grassTone.copy(GRASS_DARK).lerp(GRASS, clamp01((y - GRASS_LEVEL) / 0.9));
      grassTone.lerp(GRASS_SUN, smoothstep(1.5, 3.2, y));

      /**
       * 모래와 잔디를 **부드럽게** 섞는다.
       * y < GRASS_LEVEL 로 딱 잘랐더니 0.25m 격자가 그대로 계단으로 드러났다 —
       * 색이 한 버텍스 만에 튀면 그 격자 간격이 눈에 보이는 톱니가 된다.
       */
      const blend = smoothstep(GRASS_LEVEL - 0.35, GRASS_LEVEL + 0.45, y);
      sandTone.lerp(grassTone, blend);

      /**
       * 얼룩. 주기가 다른 사인 셋을 겹쳐 반복이 눈에 안 띄게 한다.
       * 명도만 흔들면 흑백 노이즈처럼 보여서 색조도 아주 조금 같이 흔든다 —
       * 실제 잔디는 밝기뿐 아니라 색이 조금씩 다르다.
       */
      const blotch =
        Math.sin(x * 0.62) * Math.cos(z * 0.55) * 0.018 +
        Math.sin(x * 0.19 + 2.1) * Math.cos(z * 0.23 - 0.7) * 0.026 +
        Math.sin((x + z) * 1.37) * 0.008;
      sandTone.offsetHSL(blotch * 0.35, blotch * 0.5, blotch);

      colors[i * 3] = sandTone.r;
      colors[i * 3 + 1] = sandTone.g;
      colors[i * 3 + 2] = sandTone.b;
    }

    plane.setAttribute("color", new BufferAttribute(colors, 3));
    plane.computeVertexNormals();
    // 탭 이동은 이 메시에 레이를 쏜다. BVH 없이는 7만 삼각형을 전부 훑는다.
    plane.computeBoundsTree();
    return plane;
  }, []);

  const uniforms = useMemo(
    () => ({ uCurvature: { value: curvature } }),
    [curvature],
  );

  return (
    <mesh
      geometry={geometry}
      receiveShadow
      onPointerDown={(event) => {
        if (!onTapGround) return;
        // 지형 뒤의 다른 오브젝트까지 이벤트가 번지지 않게 한다.
        event.stopPropagation();
        onTapGround(event.point.x, event.point.z);
      }}
    >
      <CustomShaderMaterial
        baseMaterial={MeshStandardMaterial}
        vertexShader={CURVED_VERTEX}
        uniforms={uniforms}
        vertexColors
        roughness={0.95}
        metalness={0}
        side={DoubleSide}
      />
    </mesh>
  );
}
