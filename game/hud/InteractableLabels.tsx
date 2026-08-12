"use client";

import { Html } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { useRef } from "react";
import type { Group } from "three";
import { CHUNKY } from "@/components/island/ui";
import { type Interactable, useInteractables } from "@/game/core/interactable";
import { elevationAt } from "@/game/core/island";
import { usePlayerController } from "@/game/core/playerControl";

/**
 * 상호작용 오브젝트 위에 떠 있는 이름표.
 *
 * "들어왔는데 뭘 해야 할지 모르겠다"에 대한 답이다. 섬 반대편에서도 이름표가 보이면
 * 메뉴 없이도 갈 곳이 생긴다.
 *
 * ── 여기가 등록 방식(§4.3)이 값어치를 하는 지점이다. ──
 * 이 컴포넌트는 게시판도 책상도 모른다. 레지스트리를 읽을 뿐이라,
 * 새 feature 를 붙이면 이름표가 저절로 따라온다. 여기 코드는 안 늘어난다.
 */
export function InteractableLabels() {
  const items = useInteractables();

  return (
    <>
      {items.map((item) => (
        <Label key={item.id} item={item} />
      ))}
    </>
  );
}

/** 위아래로 살짝 흔들리는 진폭(m)과 속도. 정지한 것보다 눈이 먼저 간다. */
const BOB_AMPLITUDE = 0.05;
const BOB_SPEED = 1.7;

function Label({ item }: { item: Interactable }) {
  const groupRef = useRef<Group>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const controllerRef = usePlayerController();

  const [x, z] = item.position;
  const baseY = elevationAt(x, z) + (item.labelHeight ?? 2.0);

  useFrame((state) => {
    const group = groupRef.current;
    if (!group) return;

    /**
     * 표시 거리가 정해진 이름표는 가까이 가야 나타난다.
     *
     * ⚠ `group.visible = false` 로는 안 사라진다. 이름표의 실체는 3D 오브젝트가
     *   아니라 화면 위에 얹힌 **DOM** 이고(drei 의 Html), 그건 부모 그룹의
     *   visible 을 보지 않는다. 실제로 그렇게 두고 "숨겼다" 고 착각했는데,
     *   섬 반대편에서도 의자 이름표 둘이 방명록 이름표를 덮고 있었다.
     *   버튼의 display 를 직접 끈다.
     *
     * 부드럽게 사라지지 않고 그냥 껐다 켠다. 투명도를 매 프레임 만지면 그만큼
     * 스타일 재계산이 도는데, 이름표 하나 페이드 시키자고 낼 값이 아니다.
     */
    const range = item.labelRange;
    if (range !== undefined) {
      const pose = controllerRef.current?.pose();
      const near =
        pose !== undefined && Math.hypot(pose.x - x, pose.z - z) < range;
      const button = buttonRef.current;
      if (button) {
        const want = near ? "" : "none";
        if (button.style.display !== want) button.style.display = want;
      }
      if (!near) return;
    }

    // id 로 위상을 어긋내야 여러 이름표가 한 몸처럼 같이 움직이지 않는다.
    const phase = item.id.length * 0.7;
    group.position.y =
      baseY +
      Math.sin(state.clock.elapsedTime * BOB_SPEED + phase) * BOB_AMPLITUDE;
  });

  return (
    <group ref={groupRef} position={[x, baseY, z]}>
      <Html center zIndexRange={[12, 0]} style={{ pointerEvents: "auto" }}>
        <button
          ref={buttonRef}
          type="button"
          onPointerDown={(event) => {
            event.stopPropagation();
            const [ax, az] = item.approachPoint;
            controllerRef.current?.moveTo(ax, az, item.id);
          }}
          className={`${CHUNKY} flex cursor-pointer items-center gap-2 whitespace-nowrap rounded-full bg-[#fdf6e8] py-2 pr-4 pl-3 font-semibold text-[14px] text-[#3a2a22] shadow-[0_4px_12px_-3px_rgba(0,0,0,0.4)]`}
        >
          {/*
            테두리도 꼬리도 없다.
            윤곽선을 두르니 확대 배율에 따라 두께가 들쭉날쭉했고, 꼬리는 그 위에서
            더 눈에 띄었다. 크림색 알약 하나에 옅은 그림자면 잔디 위에서 충분히 읽히고,
            무엇에 붙은 이름표인지는 위치가 이미 말해준다.
          */}
          <span className="size-2 rounded-full bg-[#e8734a]" />
          {item.label}
        </button>
      </Html>
    </group>
  );
}
