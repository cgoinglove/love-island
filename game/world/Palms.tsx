"use client";

import { DoubleSide } from "three";
import { elevationAt, FURNITURE } from "@/game/core/island";
import { CurvedMaterial } from "@/game/world/curvature";
import { createPalmGeometry } from "@/game/world/palmGeometry";

/**
 * 야자수.
 *
 * palmGeometry 가 기둥·잎·코코넛을 메시 하나로 구워 온다 — 그루당 드로우콜 1이고,
 * 잎이 상자가 아니라 처지는 스트립이라 실루엣이 유기적이다.
 *
 * 한때 파라솔·선베드·비치볼도 여기 있었지만 다 걷어냈다. 섬에 물건이 적을수록
 * 정작 봐야 할 것(게시판·책상·사진첩)이 눈에 들어온다.
 */
const PALM_GEOMETRY = createPalmGeometry();

export function Palms() {
  return (
    <group>
      {FURNITURE.map((item) => (
        <mesh
          key={`${item.x}:${item.z}`}
          geometry={PALM_GEOMETRY}
          position={[item.x, elevationAt(item.x, item.z), item.z]}
          // 아주 살짝 눕힌다. 완전 수직인 야자수는 전봇대다.
          rotation={[0.04, item.rotation, 0.05]}
          castShadow
          receiveShadow
        >
          <CurvedMaterial vertexColors roughness={0.85} side={DoubleSide} />
        </mesh>
      ))}
    </group>
  );
}
