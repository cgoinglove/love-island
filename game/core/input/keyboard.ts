import type { Vec2XZ } from "@/shared/types";

/**
 * 이동 입력 소스. 조이스틱·탭이동도 이 인터페이스를 구현한다.
 * 코어는 "의도를 주는 무언가"만 알고, 그게 키보드인지 엄지손가락인지는 모른다.
 */
export interface AxisSource {
  /**
   * 현재 이동 축. 정규화는 하지 않는다 — 시뮬레이션이 한다.
   *
   * 주의: 매번 같은 배열 인스턴스를 돌려준다(프레임당 할당 회피).
   * 값을 보관하려면 복사해서 써야 한다.
   */
  axis(): Vec2XZ;
  /** 점프 키가 눌려 있는가. 누르고 있으면 착지할 때마다 다시 뛴다(연속 점프). */
  jump(): boolean;
  sprint(): boolean;
  dispose(): void;
}

/** +X 동쪽, -Z 북쪽. W 가 -Z 인 이유가 이것. */
const KEY_AXIS: Readonly<Record<string, Vec2XZ>> = {
  KeyW: [0, -1],
  ArrowUp: [0, -1],
  KeyS: [0, 1],
  ArrowDown: [0, 1],
  KeyA: [-1, 0],
  ArrowLeft: [-1, 0],
  KeyD: [1, 0],
  ArrowRight: [1, 0],
};

const JUMP_KEYS = new Set(["Space"]);
const SPRINT_KEYS = new Set(["ShiftLeft", "ShiftRight"]);

/**
 * event.key 가 아니라 event.code 를 쓴다.
 * key 는 키보드 레이아웃(한글 입력 상태, Dvorak, AZERTY)에 따라 바뀌지만
 * code 는 물리적 키 위치라 항상 같다. 한글 모드에서 WASD 가 죽는 흔한 버그를 여기서 막는다.
 */
export function createKeyboardInput(target: Window = window): AxisSource {
  const pressed = new Set<string>();
  const out: [number, number] = [0, 0];

  const isTyping = (event: KeyboardEvent): boolean => {
    const node = event.target as HTMLElement | null;
    if (!node) return false;
    // 채팅창에 "wasd" 를 치는 동안 캐릭터가 걸어가면 안 된다.
    const tag = node.tagName;
    return tag === "INPUT" || tag === "TEXTAREA" || node.isContentEditable;
  };

  const onKeyDown = (event: KeyboardEvent) => {
    if (event.metaKey || event.ctrlKey || event.altKey) return;
    if (isTyping(event)) return;
    const known =
      event.code in KEY_AXIS ||
      JUMP_KEYS.has(event.code) ||
      SPRINT_KEYS.has(event.code);
    if (!known) return;
    // 방향키·스페이스로 페이지가 스크롤되면 캔버스가 움직여 보인다.
    event.preventDefault();
    pressed.add(event.code);
  };

  const onKeyUp = (event: KeyboardEvent) => {
    pressed.delete(event.code);
  };

  // 키를 누른 채 탭을 벗어나면 keyup 이 안 온다 → 캐릭터가 영원히 걸어간다.
  const clear = () => pressed.clear();

  target.addEventListener("keydown", onKeyDown);
  target.addEventListener("keyup", onKeyUp);
  target.addEventListener("blur", clear);
  target.document.addEventListener("visibilitychange", clear);

  return {
    axis() {
      let x = 0;
      let z = 0;
      for (const code of pressed) {
        const axis = KEY_AXIS[code];
        if (!axis) continue;
        x += axis[0];
        z += axis[1];
      }
      // W+S 동시 입력은 서로 상쇄되어 0 이 된다. 의도된 동작.
      out[0] = x;
      out[1] = z;
      return out;
    },
    jump() {
      for (const code of pressed) if (JUMP_KEYS.has(code)) return true;
      return false;
    },
    sprint() {
      for (const code of pressed) if (SPRINT_KEYS.has(code)) return true;
      return false;
    },
    dispose() {
      target.removeEventListener("keydown", onKeyDown);
      target.removeEventListener("keyup", onKeyUp);
      target.removeEventListener("blur", clear);
      target.document.removeEventListener("visibilitychange", clear);
      pressed.clear();
    },
  };
}

/**
 * 모바일 버튼·조이스틱이 값을 밀어 넣는 입력 소스.
 * 키보드와 같은 인터페이스라 시뮬레이션 쪽은 둘을 구분하지 않는다.
 */
export interface VirtualInput extends AxisSource {
  setAxis(x: number, z: number): void;
  setJump(down: boolean): void;
  setSprint(down: boolean): void;
}

export function createVirtualInput(): VirtualInput {
  const out: [number, number] = [0, 0];
  let jumping = false;
  let sprinting = false;

  return {
    axis: () => out,
    jump: () => jumping,
    sprint: () => sprinting,
    setAxis(x, z) {
      out[0] = x;
      out[1] = z;
    },
    setJump(down) {
      jumping = down;
    },
    setSprint(down) {
      sprinting = down;
    },
    dispose() {
      out[0] = 0;
      out[1] = 0;
      jumping = false;
      sprinting = false;
    },
  };
}
