"use client";

import { useFrame } from "@react-three/fiber";
import { useEffect, useMemo } from "react";
import {
  BoxGeometry,
  type BufferGeometry,
  CylinderGeometry,
  TorusGeometry,
} from "three";
import { setCameraShot } from "@/game/camera/cinematic";
import { isTypingTarget } from "@/game/core/input/keyboard";
import { useInteractable } from "@/game/core/interactable";
import { elevationAt } from "@/game/core/island";
import { usePlayerController } from "@/game/core/playerControl";
import { useHudStore } from "@/game/hud/store";
import { useBroadcastActivity } from "@/game/net/activity";
import { CurvedMaterial } from "@/game/world/curvature";
import { mergeColored, type Piece } from "@/game/world/meshKit";
import { t } from "@/shared/strings";
import type { Vec2XZ } from "@/shared/types";
import {
  LEAVE_DISTANCE,
  SEAT_APPROACHES,
  SEAT_PANEL_IDS,
  SEATS,
  SHOT_BACK,
  SHOT_FOV,
  SHOT_GLIDE,
  SHOT_TARGET,
  SHOT_UP,
  SIDE_TABLE,
} from "./constants";
import { useSeatStore } from "./seat";

/**
 * 바다 끝 의자 두 개.
 *
 * ── 왜 의자인가 ──
 * 이 섬에는 볼 것이 있는데(밤 불꽃놀이) **보는 자세**가 없었다. 카메라가 늘
 * 캐릭터 뒤통수에 붙어 있으니, 밤이 와도 사람들은 걸어다니면서 곁눈질로 봤다.
 * 앉는다는 건 기능이 아니라 신호다 — 여기서는 아무것도 안 해도 된다는.
 *
 * 그래서 앉으면 카메라가 캐릭터를 놓아준다. 이 섬에서 고정 방위 카메라 규칙이
 * 깨지는 유일한 자리이고, 규칙은 어겨질 때 의미가 생긴다.
 *
 * 두 개인 것도 그렇다. 하나면 혼자 앉는 자리지만 둘이면 **옆자리**가 된다.
 */

/** 비치체어 하나. 등받이가 뒤로 눕고 앉는 면에 줄무늬가 있다. */
function chairPieces(): Piece[] {
  const CANVAS_A = "#f4ede0";
  const CANVAS_B = "#e8734a";
  const FRAME = "#8a6440";

  const pieces: Piece[] = [];

  // 앉는 면 — 널을 넷으로 나눠 줄무늬를 만든다. 통짜 판이면 그냥 상자다.
  for (let i = 0; i < 4; i += 1) {
    pieces.push({
      geometry: new BoxGeometry(0.94, 0.07, 0.2),
      color: i % 2 === 0 ? CANVAS_A : CANVAS_B,
      position: [0, 0.47 + i * 0.02, 0.33 - i * 0.24],
      rotation: [0.09, 0, 0],
    });
  }

  // 등받이 — 뒤로 눕는다. 눕지 않으면 식탁의자다.
  for (let i = 0; i < 4; i += 1) {
    pieces.push({
      geometry: new BoxGeometry(0.94, 0.2, 0.07),
      color: i % 2 === 0 ? CANVAS_B : CANVAS_A,
      position: [0, 0.66 + i * 0.21, 0.46 + i * 0.1],
      rotation: [0.44, 0, 0],
    });
  }

  // 다리 넷
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      pieces.push({
        geometry: new CylinderGeometry(0.045, 0.05, 0.48, 6),
        color: FRAME,
        position: [sx * 0.42, 0.24, sz * 0.4],
      });
    }
  }

  // 팔걸이
  for (const sx of [-1, 1]) {
    pieces.push({
      geometry: new BoxGeometry(0.07, 0.06, 0.92),
      color: FRAME,
      position: [sx * 0.5, 0.68, 0.06],
      rotation: [0.06, 0, 0],
    });
    pieces.push({
      geometry: new CylinderGeometry(0.035, 0.035, 0.24, 6),
      color: FRAME,
      position: [sx * 0.5, 0.57, -0.34],
    });
  }

  return pieces;
}

/** 의자 사이 탁자. 컵 두 개가 놓여 있다 — 둘이 앉는 자리라는 뜻이다. */
function tablePieces(): Piece[] {
  return [
    {
      geometry: new CylinderGeometry(0.34, 0.3, 0.06, 14),
      color: "#c99a63",
      position: [0, 0.52, 0],
    },
    {
      geometry: new CylinderGeometry(0.07, 0.09, 0.5, 8),
      color: "#8a6440",
      position: [0, 0.26, 0],
    },
    ...[-0.14, 0.14].map((x) => ({
      geometry: new CylinderGeometry(0.07, 0.055, 0.13, 10),
      color: "#fdf6e8",
      position: [x, 0.61, 0] as const,
    })),
    // 손잡이. 없어도 되지만 있으면 컵이 컵으로 보인다.
    ...[-0.14, 0.14].map((x) => ({
      geometry: new TorusGeometry(0.045, 0.014, 6, 10),
      color: "#fdf6e8",
      position: [x + (x < 0 ? -0.08 : 0.08), 0.61, 0] as const,
      rotation: [0, Math.PI / 2, 0] as const,
    })),
  ];
}

export function Chairs() {
  const controllerRef = usePlayerController();
  const seated = useSeatStore((state) => state.index);
  const sit = useSeatStore((state) => state.sit);
  const stand = useSeatStore((state) => state.stand);

  const chairGeometry = useMemo(() => mergeColored(chairPieces()), []);
  const tableGeometry = useMemo(() => mergeColored(tablePieces()), []);

  // 앉아 있다는 걸 남들에게 알린다. 남의 화면에서도 의자에 파묻혀 앉는다.
  useBroadcastActivity("sitting", seated !== null);

  // 앉으면 걸어다니는 UI 를 접는다. 지금은 보는 시간이다.
  const setImmersive = useHudStore((state) => state.setImmersive);
  useEffect(() => {
    setImmersive(seated !== null);
    return () => setImmersive(false);
  }, [seated, setImmersive]);

  /**
   * 앉는 동안 카메라를 가져간다.
   *
   * 자리마다 카메라 위치가 다르지 않다 — 두 의자 **사이** 뒤에서 잡는다.
   * 앉은 사람이 화면 한가운데 오는 것보다, 의자 둘과 수평선이 다 들어오는 게
   * 이 장면이 하려는 말에 맞다.
   */
  useEffect(() => {
    if (seated === null) {
      setCameraShot(null);
      return;
    }
    const seat = SEATS[seated];
    if (!seat) return;
    const ground = elevationAt(seat[0], seat[1]);
    setCameraShot({
      px: 0,
      py: ground + SHOT_UP,
      pz: seat[1] + SHOT_BACK,
      tx: SHOT_TARGET[0],
      ty: SHOT_TARGET[1],
      tz: SHOT_TARGET[2],
      fov: SHOT_FOV,
      glide: SHOT_GLIDE,
      // 이 컷의 주인공은 의자다. 좁은 화면에서는 여기서 더 물러난다.
      anchor: [0, ground, seat[1]],
    });
    return () => {
      setCameraShot(null);
      /**
       * 일어나면 의자에서 한 걸음 물러난다.
       *
       * 앉을 때 의자 한가운데에 놓았으므로 그냥 일어서면 **의자를 뚫고 서 있는**
       * 그림이 된다. 걸어 나가서 일어난 경우(이미 멀리 있다)에는 건드리지 않는다 —
       * 그때 자리로 되돌리면 그건 일어나는 게 아니라 끌려오는 것이다.
       */
      const approach = SEAT_APPROACHES[seated];
      const pose = controllerRef.current?.pose();
      if (!approach || !pose) return;
      if (Math.hypot(pose.x - seat[0], pose.z - seat[1]) > LEAVE_DISTANCE) {
        return;
      }
      controllerRef.current?.place(approach[0], approach[1], pose.yaw);
    };
  }, [seated, controllerRef]);

  /**
   * 일어나는 길.
   *
   * ESC 와 이동키가 곧 "그만" 이다. 앉은 채로 카메라가 딴 데를 보고 있으므로,
   * 걸으려는 시도는 예외 없이 **먼저 일어나는 것**으로 받아야 한다 —
   * 안 그러면 화면 밖에서 캐릭터가 걸어다닌다.
   */
  useEffect(() => {
    if (seated === null) return;
    const onKey = (event: KeyboardEvent) => {
      // ⚠ 앉아서 대화하는 자리다. 채팅창에 "가자" 를 치는 동안 일어나면 안 된다.
      if (isTypingTarget(event)) return;
      const key = event.key.toLowerCase();
      const moving =
        key === "escape" ||
        key === " " ||
        key.startsWith("arrow") ||
        key === "w" ||
        key === "a" ||
        key === "s" ||
        key === "d";
      if (moving) stand();
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [seated, stand]);

  // 조이스틱으로 빠져나가는 경우. 자리에서 멀어지면 일어난 것이다.
  useFrame(() => {
    if (seated === null) return;
    const seat = SEATS[seated];
    const pose = controllerRef.current?.pose();
    if (!seat || !pose) return;
    if (Math.hypot(pose.x - seat[0], pose.z - seat[1]) > LEAVE_DISTANCE) {
      stand();
    }
  });

  return (
    <group>
      {SEATS.map((seat, index) => (
        <Chair
          key={SEAT_PANEL_IDS[index] ?? index}
          id={SEAT_PANEL_IDS[index] ?? `sunset-seat-${index}`}
          seat={seat}
          approach={SEAT_APPROACHES[index] ?? seat}
          idle={seated === null}
          onSit={() => {
            // 걸어가서 멈추는 것으론 자세가 안 맞는다. 그 자리에 정확히 놓는다.
            controllerRef.current?.place(seat[0], seat[1], 0);
            sit(index);
          }}
          geometry={chairGeometry}
        />
      ))}

      <mesh
        geometry={tableGeometry}
        position={[
          SIDE_TABLE[0],
          elevationAt(SIDE_TABLE[0], SIDE_TABLE[1]),
          SIDE_TABLE[1],
        ]}
        castShadow
        receiveShadow
      >
        <CurvedMaterial vertexColors roughness={0.8} />
      </mesh>
    </group>
  );
}

function Chair({
  id,
  seat,
  approach,
  idle,
  onSit,
  geometry,
}: {
  id: string;
  seat: Vec2XZ;
  approach: Vec2XZ;
  /** 아무도 안 앉아 있는가. 앉아 있는 동안엔 이름표를 내린다. */
  idle: boolean;
  onSit: () => void;
  geometry: BufferGeometry;
}) {
  const controllerRef = usePlayerController();

  useInteractable({
    id,
    position: seat,
    approachPoint: approach,
    radius: 2.2,
    label: t().sunset.label,
    labelHeight: 1.9,
    /**
     * 이름표는 근처에서만. 앉기는 섬 반대편에서 보고 찾아올 컨텐츠가 아니라
     * **거기 있을 때 하는 행동**이고, 둘이 나란히 떠 있으면 그 앞을 지나는
     * 사람들의 말풍선을 가린다.
     */
    labelRange: 11,
    // 앉아 있는 동안 이름표가 뜨면 정작 봐야 할 수평선 앞을 가린다.
    enabled: idle,
    onInteract: onSit,
  });

  return (
    <mesh
      geometry={geometry}
      position={[seat[0], elevationAt(seat[0], seat[1]), seat[1]]}
      castShadow
      receiveShadow
      onPointerDown={(event) => {
        event.stopPropagation();
        controllerRef.current?.moveTo(approach[0], approach[1], id);
      }}
    >
      <CurvedMaterial vertexColors roughness={0.8} />
    </mesh>
  );
}
