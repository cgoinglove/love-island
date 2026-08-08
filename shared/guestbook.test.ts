import { describe, expect, it } from "vitest";
import { createGuestbookInput } from "./guestbook";

/**
 * 방명록 입력 계약.
 *
 * 이 스키마는 클라이언트와 서버가 **같이** 보는 유일한 진실이라, 여기가 화면과
 * 어긋나면 사용자는 이유를 알 수 없는 거절만 받는다. 실제로 그랬다 —
 * 입력칸은 textarea 인데 스키마가 줄바꿈을 제어문자로 보고 막아서,
 * 엔터를 친 쪽지는 전부 "쓸 수 없는 문자가 있어요" 로 튕겼다.
 */
function valid(overrides: Record<string, unknown> = {}) {
  return {
    nickname: "cgoing",
    message: "안녕하세요",
    room: "island",
    posX: 3,
    posZ: -7,
    ...overrides,
  };
}

describe("createGuestbookInput", () => {
  it("여러 줄 쪽지를 받는다", () => {
    // 화면이 whitespace-pre-wrap 으로 줄바꿈을 보여주는 이상, 계약도 받아야 한다.
    const parsed = createGuestbookInput.safeParse(
      valid({ message: "첫 줄\n둘째 줄\n\n띄우고 넷째 줄" }),
    );
    expect(parsed.success).toBe(true);
  });

  it("줄바꿈 말고 다른 제어문자는 막는다", () => {
    for (const bad of [
      "탭\t넣기",
      "널\u0000문자",
      "벨\u0007소리",
      "이스케이프\u001b",
    ]) {
      expect(
        createGuestbookInput.safeParse(valid({ message: bad })).success,
      ).toBe(false);
    }
  });

  it("이름에는 줄바꿈도 못 넣는다", () => {
    // 이름은 한 줄짜리 input 이고 카드 헤더에 들어간다. 줄이 바뀌면 레이아웃이 깨진다.
    expect(
      createGuestbookInput.safeParse(valid({ nickname: "cg\noing" })).success,
    ).toBe(false);
  });

  it("빈 쪽지와 공백뿐인 쪽지를 막는다", () => {
    for (const bad of ["", "   ", "\n\n"]) {
      expect(
        createGuestbookInput.safeParse(valid({ message: bad })).success,
      ).toBe(false);
    }
  });

  it("섬 밖 좌표를 막는다", () => {
    // 범위를 벗어나면 쪽지가 바다 위에 떠 있게 된다.
    expect(createGuestbookInput.safeParse(valid({ posX: 240 })).success).toBe(
      false,
    );
    expect(createGuestbookInput.safeParse(valid({ posZ: -99 })).success).toBe(
      false,
    );
  });

  it("앞뒤 공백을 다듬어 저장한다", () => {
    const parsed = createGuestbookInput.parse(
      valid({ nickname: "  cgoing  ", message: "  안녕  " }),
    );
    expect(parsed.nickname).toBe("cgoing");
    expect(parsed.message).toBe("안녕");
  });
});
