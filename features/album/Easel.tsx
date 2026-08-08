"use client";

import { useMemo } from "react";
import { QuadraticBezierCurve3, TubeGeometry, Vector3 } from "three";
import { useInteractable } from "@/game/core/interactable";
import { elevationAt } from "@/game/core/island";
import { usePlayerController } from "@/game/core/playerControl";
import { useHudStore } from "@/game/hud/store";
import { CurvedMaterial } from "@/game/world/curvature";
import { ALBUM_PANEL_ID, EASEL_APPROACH, EASEL_POSITION } from "./constants";
import { PHOTOS } from "./content";

const [X, Z] = EASEL_POSITION;
const Y = elevationAt(X, Z);

/** 액자 벽에 걸리는 사진 수. 실제 사진첩은 패널에서 전부 본다. */
const PREVIEW = PHOTOS.slice(0, 4);

/**
 * 사진첩. 야외에 세워둔 액자 벽이다.
 * 색 카드가 미리보기로 걸려 있고, 다가가면 전체를 패널에서 본다.
 */
export function Easel() {
  const controllerRef = usePlayerController();

  useInteractable({
    id: ALBUM_PANEL_ID,
    position: EASEL_POSITION,
    approachPoint: EASEL_APPROACH,
    radius: 3,
    label: "사진첩 보기",
    onInteract: () => useHudStore.getState().openPanel(ALBUM_PANEL_ID),
  });

  return (
    <group
      position={[X, Y, Z]}
      rotation={[0, -0.1, 0]}
      onPointerDown={(event) => {
        event.stopPropagation();
        controllerRef.current?.moveTo(
          EASEL_APPROACH[0],
          EASEL_APPROACH[1],
          ALBUM_PANEL_ID,
        );
      }}
    >
      {/* 기둥 두 개 — 바깥으로 살짝 벌어져야 "빨랫대"가 된다 */}
      <mesh castShadow position={[-1.85, 1.1, 0]} rotation={[0, 0, 0.07]}>
        <cylinderGeometry args={[0.09, 0.12, 2.3, 7]} />
        <CurvedMaterial color="#8a6440" roughness={0.9} />
      </mesh>
      <mesh castShadow position={[1.85, 1.1, 0]} rotation={[0, 0, -0.07]}>
        <cylinderGeometry args={[0.09, 0.12, 2.3, 7]} />
        <CurvedMaterial color="#8a6440" roughness={0.9} />
      </mesh>
      {/* 기둥 머리 — 잘린 원기둥 끝은 공을 얹어 마감한다 */}
      <mesh castShadow position={[-1.93, 2.28, 0]}>
        <sphereGeometry args={[0.13, 10, 8]} />
        <CurvedMaterial color="#7d5a3c" roughness={0.85} />
      </mesh>
      <mesh castShadow position={[1.93, 2.28, 0]}>
        <sphereGeometry args={[0.13, 10, 8]} />
        <CurvedMaterial color="#7d5a3c" roughness={0.85} />
      </mesh>

      {/* 줄 — 가운데가 처진다. TubeGeometry 로 곡선을 그대로 만든다 */}
      <Rope />

      {/* 걸린 사진들. 각자 다른 높이·기울기로 매달려야 "널어둔 것"이 된다 */}
      {PREVIEW.map((photo, index) => {
        const t = index / (PREVIEW.length - 1);
        const px = -1.35 + t * 2.7;
        // 매다는 높이는 줄의 처짐을 따라간다.
        const py = 2.22 - Math.sin(Math.PI * t) * 0.34;
        const tilt = [0.09, -0.13, 0.05, -0.08][index] ?? 0;
        return (
          <group
            key={photo.id}
            position={[px, py - 0.5, 0.05]}
            rotation={[0.04, 0, tilt]}
          >
            {/* 집게 */}
            <mesh position={[0, 0.46, 0]}>
              <boxGeometry args={[0.06, 0.12, 0.04]} />
              <CurvedMaterial color="#d9a05a" roughness={0.7} />
            </mesh>
            <mesh castShadow>
              <boxGeometry args={[0.62, 0.78, 0.035]} />
              <CurvedMaterial color="#fdfaf2" roughness={0.85} />
            </mesh>
            <mesh position={[0, 0.06, 0.023]}>
              <planeGeometry args={[0.52, 0.55]} />
              <CurvedMaterial color={photo.tint} roughness={0.8} />
            </mesh>
          </group>
        );
      })}
    </group>
  );
}

/** 두 기둥 사이에 처진 줄. 직선 막대를 걸면 철봉이 된다. */
function Rope() {
  const geometry = useMemo(() => {
    const curve = new QuadraticBezierCurve3(
      new Vector3(-1.85, 2.26, 0),
      new Vector3(0, 1.86, 0.02),
      new Vector3(1.85, 2.26, 0),
    );
    return new TubeGeometry(curve, 14, 0.022, 5, false);
  }, []);
  return (
    <mesh geometry={geometry}>
      <CurvedMaterial color="#d9c9a8" roughness={0.9} />
    </mesh>
  );
}
