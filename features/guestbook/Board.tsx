"use client";

import { useInteractable } from "@/game/core/interactable";
import { elevationAt } from "@/game/core/island";
import { usePlayerController } from "@/game/core/playerControl";
import { useHudStore } from "@/game/hud/store";
import { CurvedMaterial } from "@/game/world/curvature";
import { t } from "@/shared/strings";
import { createBoardGeometry } from "./boardGeometry";
import {
  GUESTBOOK_PANEL_ID,
  MAILBOX_APPROACH,
  MAILBOX_POSITION,
} from "./constants";

const [X, Z] = MAILBOX_POSITION;
const Y = elevationAt(X, Z);

/** 모듈 수준에서 한 번만 굽는다. 판 하나에 드로우콜 하나. */
const BOARD_GEOMETRY = createBoardGeometry();

/**
 * 방명록 게시판.
 *
 * 우체통이었을 땐 "편지를 넣는 곳"이라 안에 뭐가 들었는지 밖에서 안 보였다.
 * 판에 포스트잇을 붙여두면 **멀리서도 남의 흔적이 보인다** — 열어보기 전에
 * 이미 "여기 사람들이 다녀갔구나"가 전달되는 게 방명록에는 더 맞다.
 *
 * 이 컴포넌트는 자기를 코어에 등록할 뿐이다. 근접 프롬프트, E 키, 탭하면 걸어가서
 * 자동으로 열리는 동작 — 전부 등록의 부산물이고 여기 코드는 한 줄도 없다. (기획서 §4.3)
 */
export function Board() {
  const controllerRef = usePlayerController();

  useInteractable({
    id: GUESTBOOK_PANEL_ID,
    position: MAILBOX_POSITION,
    approachPoint: MAILBOX_APPROACH,
    radius: 2.8,
    label: t().guestbook.label,
    /**
     * 판 꼭대기(1.15 + 2.5)보다 위. 이름표가 포스트잇을 가리면 안 된다.
     * 다만 더 올리면 그 위에 뜬 바다 배너의 문구를 가린다 — 둘 사이의 좁은 띠다.
     */
    labelHeight: 3.9,
    onInteract: () => useHudStore.getState().openPanel(GUESTBOOK_PANEL_ID),
  });

  return (
    <mesh
      geometry={BOARD_GEOMETRY}
      position={[X, Y, Z]}
      // 정면으로 세우면 판이 납작해 보인다. 살짝 틀어야 두께가 읽힌다.
      rotation={[0, 0.12, 0]}
      castShadow
      receiveShadow
      onPointerDown={(event) => {
        // 지형까지 이벤트가 내려가면 게시판 대신 그 뒤 바닥으로 걸어간다.
        event.stopPropagation();
        controllerRef.current?.moveTo(
          MAILBOX_APPROACH[0],
          MAILBOX_APPROACH[1],
          GUESTBOOK_PANEL_ID,
        );
      }}
    >
      <CurvedMaterial vertexColors roughness={0.9} />
    </mesh>
  );
}
