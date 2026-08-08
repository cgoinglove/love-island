"use client";

import { useFrame } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import type { Group } from "three";
import { CurvedMaterial } from "@/game/world/curvature";
import {
  characterGeometryFor,
  getArmGeometry,
  shoulderOf,
} from "./characterGeometry";
import { lookOf } from "./characterLook";

export { CHARACTER_HEIGHT } from "./characterGeometry";

/** 팔을 들어 올리는 최대 각(라디안). 1.6 ≈ 92°, 어깨보다 살짝 위. */
const ARM_RAISE = 1.6;

export interface CharacterModelProps {
  /**
   * 외형을 정하는 씨앗. 보통 playerId 를 넘긴다.
   * 같은 값이면 언제 봐도 같은 모습이 나온다.
   */
  seed?: string;
  castShadow?: boolean;
}

/**
 * 캐릭터 외형. 내 캐릭터와 다른 접속자가 같은 컴포넌트를 쓴다.
 *
 * 생김새는 seed 하나로 갈린다 — 색 · 귀 모양 · 머리 크기 · 몸 길이 · 액세서리.
 * 색만 바꾸던 시절엔 섬에 셋이 있어도 같은 인형 셋으로 보였는데, 실루엣이
 * 달라지자 비로소 "다른 사람"이 됐다. 사람을 구분하는 건 색이 아니라 윤곽이다.
 *
 * 몸·머리·귀·눈·코·모자를 정점 색으로 구워 **한 명당 메시 하나**로 그린다.
 * 조각으로 두면 한 명에 드로우콜 열이라 다섯 명만 모여도 예산을 넘겼다.
 *
 * ⚠ 머티리얼은 반드시 CurvedMaterial 이다. 여기가 평범한 meshStandardMaterial 이라
 *   캐릭터만 곡률을 안 타고 땅 위 0.75m 에 떠 있었다.
 *   game/world/materialCoverage.test.ts 가 이 파일을 감시한다.
 */
export function CharacterModel({
  seed = "guest",
  castShadow = true,
}: CharacterModelProps) {
  const geometry = useMemo(() => characterGeometryFor(seed), [seed]);
  const look = useMemo(() => lookOf(seed), [seed]);
  const shoulder = useMemo(() => shoulderOf(seed), [seed]);
  const armGeometry = useMemo(getArmGeometry, []);

  const leftArm = useRef<Group>(null);
  const rightArm = useRef<Group>(null);

  /**
   * 팔은 **옆으로** 들었다 내린다 — 사이드 래터럴 레이즈 하듯이.
   *
   * 처음엔 X 축으로 앞뒤로 흔들었는데 그건 걷는 동작이라, 가만히 서 있는 캐릭터가
   * 제자리걸음하는 것처럼 보였다. Z 축으로 돌리면 팔이 몸 옆으로 벌어졌다 붙는다.
   * 좌우가 **같은 위상**인 것도 그래서다 — 한쪽씩 올리면 그건 운동이 아니라 인사다.
   *
   * 속도는 사람마다 다르다(look.armSpeed). 다 같으면 인형 여럿이 같은 태엽으로 돈다.
   */
  useFrame((state) => {
    const t = state.clock.elapsedTime * look.armSpeed;
    // 0 → 1 → 0. cos 을 쓰면 아래에서 시작해 위에서 잠깐 머문다.
    const raise = (0.5 - 0.5 * Math.cos(t)) * ARM_RAISE;
    if (leftArm.current) leftArm.current.rotation.z = -raise;
    if (rightArm.current) rightArm.current.rotation.z = raise;
  });

  return (
    <group>
      <mesh geometry={geometry} castShadow={castShadow}>
        <CurvedMaterial vertexColors roughness={0.75} />
      </mesh>

      {([-1, 1] as const).map((side) => (
        <group
          key={side}
          ref={side < 0 ? leftArm : rightArm}
          position={[side * shoulder.x, shoulder.y, 0]}
        >
          <mesh geometry={armGeometry} castShadow={castShadow}>
            {/* 몸통보다 확실히 밝게. 같은 색이면 팔이 몸에 묻혀 안 보인다. */}
            <CurvedMaterial color={look.armColor} roughness={0.75} />
          </mesh>
        </group>
      ))}
    </group>
  );
}
