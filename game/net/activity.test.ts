import { beforeEach, describe, expect, it, vi } from "vitest";
import { ACTIVITY_TTL_MS } from "@/shared/presence";
import { useActivityStore } from "./activity";

/**
 * 활동 상태는 **사건**으로 오간다. 사건은 한 번 지나가면 끝이라, 그만두는
 * 신호를 놓친 사람이 반드시 생긴다(탭을 그냥 닫는 게 가장 흔하다).
 * 그래서 TTL 이 유일한 안전장치다 — 여기가 새면 남의 화면에 유령 낚싯대가
 * 영원히 남는다.
 */
describe("활동 상태", () => {
  beforeEach(() => {
    useActivityStore.setState({ doing: {} });
    vi.useRealTimers();
  });

  it("같은 일을 되풀이해 알려도 리렌더를 만들지 않는다", () => {
    const store = useActivityStore.getState();
    store.mark("a", "fishing");
    const first = useActivityStore.getState().doing;

    store.mark("a", "fishing");
    /**
     * 2.5초마다 오는 "아직 하는 중" 신호가 매번 새 객체를 만들면, 낚시하는
     * 사람이 하나만 있어도 씬 전체가 그 주기로 리렌더된다.
     */
    expect(useActivityStore.getState().doing).toBe(first);
  });

  it("다른 일로 바뀌면 새로 알려진다", () => {
    const store = useActivityStore.getState();
    store.mark("a", "fishing");
    store.mark("a", "sitting");
    expect(useActivityStore.getState().doing.a?.kind).toBe("sitting");
  });

  it("소식이 끊기면 TTL 뒤에 사라진다", () => {
    vi.useFakeTimers();
    const store = useActivityStore.getState();
    store.mark("a", "fishing");

    vi.advanceTimersByTime(ACTIVITY_TTL_MS - 1);
    useActivityStore.getState().expire();
    expect(useActivityStore.getState().doing.a).toBeDefined();

    vi.advanceTimersByTime(2);
    useActivityStore.getState().expire();
    expect(useActivityStore.getState().doing.a).toBeUndefined();
  });

  it("아무도 안 지워질 땐 같은 객체를 유지한다", () => {
    const store = useActivityStore.getState();
    store.mark("a", "fishing");
    const before = useActivityStore.getState().doing;
    useActivityStore.getState().expire();
    expect(useActivityStore.getState().doing).toBe(before);
  });
});
