"use client";

import { useMemo } from "react";
import { BoxGeometry, CylinderGeometry } from "three";
import { useInteractable } from "@/game/core/interactable";
import { elevationAt } from "@/game/core/island";
import { usePlayerController } from "@/game/core/playerControl";
import { CurvedMaterial } from "@/game/world/curvature";
import { mergeColored } from "@/game/world/meshKit";
import { t } from "@/shared/strings";
import {
  CAST_AIM,
  FISHING_APPROACH,
  FISHING_PANEL_ID,
  FISHING_POSITION,
} from "./constants";
import { useFishingStore } from "./session";

const [X, Z] = FISHING_POSITION;
const Y = elevationAt(X, Z);

/**
 * 낚시터 — 물가에 박아둔 낚싯대 거치대와 양동이.
 *
 * 아무 물가에서나 던지게 하지 않고 **자리를 만든 이유**: 그래야 "여기서 하는 것"이
 * 눈에 보인다. 키를 하나 더 늘리는 대신 기존 상호작용(E · 탭)에 얹으면
 * 배울 게 없고, 봇도 "저기로 가세요" 라고 안내할 대상이 생긴다.
 */
function createSpotGeometry() {
  return mergeColored([
    // 거치대 기둥 둘
    ...[-0.35, 0.35].map((offset) => ({
      geometry: new CylinderGeometry(0.06, 0.07, 0.9, 8),
      color: "#7d5836",
      position: [offset, 0.45, 0] as const,
    })),
    // 가로대
    {
      geometry: new BoxGeometry(0.9, 0.07, 0.09),
      color: "#8a6440",
      position: [0, 0.86, 0] as const,
    },
    // 낚싯대. 물 쪽(-Z)으로 비스듬히 걸쳐둔다.
    {
      geometry: new CylinderGeometry(0.022, 0.012, 2.4, 6),
      color: "#4a3428",
      rotation: [1.15, 0, 0.1] as const,
      position: [0.1, 1.05, -0.55] as const,
    },
    // 양동이
    {
      geometry: new CylinderGeometry(0.22, 0.18, 0.3, 12),
      color: "#57b6d6",
      position: [-0.7, 0.15, 0.25] as const,
    },
  ]);
}

export function FishingSpot() {
  const controllerRef = usePlayerController();
  const geometry = useMemo(createSpotGeometry, []);
  // 낚시 중엔 이름표가 정작 봐야 할 찌를 가린다.
  const fishing = useFishingStore((state) => state.stage) !== "away";

  useInteractable({
    id: FISHING_PANEL_ID,
    position: FISHING_POSITION,
    approachPoint: FISHING_APPROACH,
    radius: 2.4,
    label: t().fishing.label,
    labelHeight: 2.6,
    enabled: !fishing,
    /**
     * 패널을 여는 게 아니라 **낚시 모드로 들어간다.**
     * 모달이 뜨면 그 순간 3D 가 배경이 되고, 배경이 되면 게임이 아니라 설명서가 된다.
     */
    onInteract: () => {
      /**
       * 물 쪽을 보게 돌려세운다.
       *
       * 걸어온 방향 그대로 서 있으면 몸은 섬 안쪽을 보는데 낚싯대만 바다로
       * 뻗는다 — 대를 손에 들려준 순간부터 그 어긋남이 눈에 띈다.
       * 자리는 그대로 두고 **각도만** 바꾼다.
       */
      const pose = controllerRef.current?.pose();
      if (pose) {
        controllerRef.current?.place(
          pose.x,
          pose.z,
          Math.atan2(-CAST_AIM[0], -CAST_AIM[1]),
        );
      }
      useFishingStore.getState().set("ready");
    },
  });

  return (
    <mesh
      geometry={geometry}
      position={[X, Y, Z]}
      rotation={[0, 0.2, 0]}
      castShadow
      receiveShadow
      onPointerDown={(event) => {
        event.stopPropagation();
        controllerRef.current?.moveTo(
          FISHING_APPROACH[0],
          FISHING_APPROACH[1],
          FISHING_PANEL_ID,
        );
      }}
    >
      <CurvedMaterial vertexColors roughness={0.85} />
    </mesh>
  );
}
