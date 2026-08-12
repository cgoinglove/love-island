"use client";

import { useFrame } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import { BoxGeometry, CylinderGeometry, type Group } from "three";
import { useInteractable } from "@/game/core/interactable";
import { elevationAt } from "@/game/core/island";
import { usePlayerController } from "@/game/core/playerControl";
import { CurvedBasicMaterial, CurvedMaterial } from "@/game/world/curvature";
import { skyState } from "@/game/world/dayNight";
import { mergeColored, type Piece } from "@/game/world/meshKit";
import { t } from "@/shared/strings";
import {
  LAUNCHER_APPROACH,
  LAUNCHER_PANEL_ID,
  LAUNCHER_POSITION,
  LEAVE_DISTANCE,
} from "./constants";
import { useLauncherStore } from "./session";

const [X, Z] = LAUNCHER_POSITION;
const Y = elevationAt(X, Z);

/**
 * 폭죽 발사대.
 *
 * ── 왜 자리를 만드나 ──
 * 1·2·3 을 누르면 어디서든 폭죽이 터진다. 그런데 그건 **이모티콘**이지 폭죽놀이가
 * 아니다. 밤에 물가로 걸어가서, 대를 잡고, 힘을 모아 쏘는 일련의 동작이 있어야
 * 그게 하는 일이 된다 — 그리고 그래야 옆에 앉은 사람이 볼 것이 생긴다.
 *
 * 노을 의자 바로 옆에 둔 것도 그래서다. 한 명은 쏘고 한 명은 앉아서 본다.
 */
function launcherPieces(): Piece[] {
  const IRON = "#4a5560";
  const WOOD = "#8a6440";
  const PAPER = "#e8734a";

  return [
    // 받침 — 모래에 박아둔 나무 틀.
    {
      geometry: new BoxGeometry(1.15, 0.14, 0.75),
      color: WOOD,
      position: [0, 0.12, 0],
    },
    ...[-0.42, 0.42].map((x) => ({
      geometry: new BoxGeometry(0.12, 0.34, 0.68),
      color: WOOD,
      position: [x, 0.3, 0] as const,
    })),
    /**
     * 발사관 셋. 조금씩 다른 각도로 벌려 세운다 —
     * 나란히 세우면 파이프 오르간이고, 벌려 세우면 쏘는 물건이다.
     */
    ...[-0.3, 0, 0.3].map((x, index) => ({
      geometry: new CylinderGeometry(0.11, 0.13, 0.95, 10),
      color: IRON,
      rotation: [0.06, 0, (index - 1) * -0.16] as const,
      position: [x, 0.72, 0.02] as const,
    })),
    // 관 위로 삐져나온 도화선 달린 탄. 쏠 게 남아 있다는 표시다.
    ...[-0.3, 0.3].map((x) => ({
      geometry: new CylinderGeometry(0.085, 0.085, 0.26, 8),
      color: PAPER,
      position: [x, 1.24, 0.02] as const,
    })),
  ];
}

export function Launcher() {
  const controllerRef = usePlayerController();
  const geometry = useMemo(() => mergeColored(launcherPieces()), []);
  const active = useLauncherStore((state) => state.active);
  const leave = useLauncherStore((state) => state.leave);
  const glowRef = useRef<Group>(null);

  useInteractable({
    id: LAUNCHER_PANEL_ID,
    position: LAUNCHER_POSITION,
    approachPoint: LAUNCHER_APPROACH,
    radius: 2.2,
    label: t().fireworks.label,
    labelHeight: 1.9,
    // 쏘는 동안 이름표가 뜨면 정작 봐야 할 하늘 앞을 가린다.
    enabled: !active,
    /** 밤에만 눈에 띄면 되므로 이름표는 늘 근처에서만 뜬다. */
    labelRange: 11,
    onInteract: () => useLauncherStore.getState().enter(),
  });

  useFrame(() => {
    // 자리를 벗어나면 끝난다. 걸어가는 게 곧 "그만두겠다" 는 뜻이다.
    if (active) {
      const pose = controllerRef.current?.pose();
      if (pose && Math.hypot(pose.x - X, pose.z - Z) > LEAVE_DISTANCE) leave();
    }

    // 밤에는 도화선 옆의 등불이 켜진다. 어두운 물가에서 여기가 있다는 표시.
    const glow = glowRef.current;
    const lit = skyState.daylight < 0.32;
    if (glow && glow.visible !== lit) glow.visible = lit;
  });

  return (
    <group position={[X, Y, Z]} rotation={[0, -0.25, 0]}>
      <mesh
        geometry={geometry}
        castShadow
        receiveShadow
        onPointerDown={(event) => {
          event.stopPropagation();
          controllerRef.current?.moveTo(
            LAUNCHER_APPROACH[0],
            LAUNCHER_APPROACH[1],
            LAUNCHER_PANEL_ID,
          );
        }}
      >
        <CurvedMaterial vertexColors roughness={0.75} />
      </mesh>

      <group ref={glowRef} visible={false}>
        <mesh position={[0.62, 0.62, 0.2]}>
          <sphereGeometry args={[0.09, 8, 6]} />
          <CurvedBasicMaterial color="#ffdf95" />
        </mesh>
        <mesh position={[0.62, 0.62, 0.2]}>
          <sphereGeometry args={[0.3, 8, 6]} />
          <CurvedBasicMaterial
            color="#ffcf6b"
            transparent
            opacity={0.22}
            depthWrite={false}
          />
        </mesh>
      </group>
    </group>
  );
}
