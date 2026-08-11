"use client";

import { useMemo } from "react";
import { useInteractable } from "@/game/core/interactable";
import { elevationAt } from "@/game/core/island";
import { usePlayerController } from "@/game/core/playerControl";
import { useHudStore } from "@/game/hud/store";
import { CurvedMaterial } from "@/game/world/curvature";
import { t } from "@/shared/strings";
import {
  CAREER_PANEL_ID,
  MONUMENT_APPROACH,
  MONUMENT_POSITION,
} from "./constants";
import {
  createDeskGeometry,
  createLaptopBodyGeometry,
  createLidGeometry,
  createScreenTexture,
  HINGE,
  LID_ANGLE,
  LID_HEIGHT,
  LID_WIDTH,
} from "./deskGeometry";

const [X, Z] = MONUMENT_POSITION;
const Y = elevationAt(X, Z);

/** 모듈 수준에서 한 번만 굽는다. 나무 · 알루미늄 · 뚜껑 = 드로우콜 셋. */
const DESK_GEOMETRY = createDeskGeometry();
const BODY_GEOMETRY = createLaptopBodyGeometry();
const LID_GEOMETRY = createLidGeometry();

/**
 * 경력 — 책상 위의 노트북.
 *
 * 비석이었을 땐 "기념물"이라 지나간 일처럼 보였다. 일하는 자리를 그대로 놓으면
 * 경력이 박제가 아니라 **지금도 하고 있는 일**로 읽힌다. 화면이 켜져 있는 것도
 * 같은 이유다 — 자리를 비운 게 아니라 잠깐 일어난 것처럼 보여야 한다.
 */
export function Desk() {
  const controllerRef = usePlayerController();
  // 캔버스를 만지므로 브라우저에서만 굽는다. 모듈 수준이면 SSR 에서 터진다.
  const screenTexture = useMemo(createScreenTexture, []);

  useInteractable({
    id: CAREER_PANEL_ID,
    position: MONUMENT_POSITION,
    approachPoint: MONUMENT_APPROACH,
    radius: 3,
    label: t().career.label,
    onInteract: () => useHudStore.getState().openPanel(CAREER_PANEL_ID),
  });

  const walkOver = (event: { stopPropagation(): void }) => {
    event.stopPropagation();
    controllerRef.current?.moveTo(
      MONUMENT_APPROACH[0],
      MONUMENT_APPROACH[1],
      CAREER_PANEL_ID,
    );
  };

  return (
    <group
      position={[X, Y, Z]}
      rotation={[0, 0.26, 0]}
      onPointerDown={walkOver}
    >
      <mesh geometry={DESK_GEOMETRY} castShadow receiveShadow>
        <CurvedMaterial vertexColors roughness={0.8} />
      </mesh>

      <mesh geometry={BODY_GEOMETRY} castShadow>
        <CurvedMaterial vertexColors roughness={0.35} metalness={0.5} />
      </mesh>

      {/* 뚜껑과 화면은 경첩을 축으로 함께 돈다. */}
      <group position={[0, HINGE.y, HINGE.z]} rotation={[LID_ANGLE, 0, 0]}>
        <mesh geometry={LID_GEOMETRY} castShadow>
          <CurvedMaterial vertexColors roughness={0.35} metalness={0.5} />
        </mesh>

        <mesh position={[0, LID_HEIGHT / 2, 0.011]}>
          <planeGeometry args={[LID_WIDTH - 0.06, LID_HEIGHT - 0.06]} />
          {/*
            발광으로 그린다. 이 섬은 해가 낮아 책상이 그늘에 들어가는데,
            그늘에서도 화면만 밝아야 "켜져 있다"가 된다.
          */}
          <CurvedMaterial
            map={screenTexture}
            emissiveMap={screenTexture}
            emissive="#ffffff"
            emissiveIntensity={0.75}
            roughness={0.5}
            toneMapped={false}
          />
        </mesh>
      </group>
    </group>
  );
}
