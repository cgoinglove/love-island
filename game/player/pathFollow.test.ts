import { describe, expect, it } from "vitest";
import type { Vec2XZ } from "@/shared/types";
import {
  clearPath,
  createPathFollower,
  followPath,
  isFollowing,
  setPath,
} from "./pathFollow";

const PATH: Vec2XZ[] = [
  [5, 0],
  [5, 5],
  [0, 5],
];

describe("followPath", () => {
  it("경로가 없으면 축이 0 이다", () => {
    const follower = createPathFollower();
    expect(followPath(follower, 0, 0, 0.3)).toEqual([0, 0]);
    expect(isFollowing(follower)).toBe(false);
  });

  it("첫 웨이포인트를 향한다", () => {
    const follower = createPathFollower();
    setPath(follower, PATH);
    const [x, z] = followPath(follower, 0, 0, 0.3);
    expect(x).toBeGreaterThan(0);
    expect(z).toBe(0);
  });

  it("웨이포인트에 닿으면 다음 것으로 넘어간다", () => {
    const follower = createPathFollower();
    setPath(follower, PATH);
    followPath(follower, 5, 0, 0.3);
    expect(follower.index).toBe(1);
    const [x, z] = followPath(follower, 5, 0, 0.3);
    expect(x).toBe(0);
    expect(z).toBeGreaterThan(0);
  });

  it("한 스텝에 여러 웨이포인트를 지나쳐도 밀리지 않는다", () => {
    // 스무딩된 경로는 웨이포인트 간격이 촘촘할 수 있다. while 이 아니라 if 였다면 여기서 밀린다.
    const dense: Vec2XZ[] = [
      [0.1, 0],
      [0.2, 0],
      [0.3, 0],
      [9, 0],
    ];
    const follower = createPathFollower();
    setPath(follower, dense);
    const [x] = followPath(follower, 0.35, 0, 0.5);
    expect(follower.index).toBe(3);
    expect(x).toBeGreaterThan(0);
  });

  it("마지막 지점은 더 정확하게 밟는다", () => {
    const follower = createPathFollower();
    setPath(follower, [[1, 0]]);
    // 임계값 0.5 의 절반인 0.25 보다 멀면 아직 도착이 아니다.
    followPath(follower, 0.6, 0, 0.5);
    expect(follower.arrived).toBe(false);
    followPath(follower, 0.9, 0, 0.5);
    expect(follower.arrived).toBe(true);
  });

  it("전부 소비하면 arrived 가 서고 경로가 비워진다", () => {
    const follower = createPathFollower();
    setPath(follower, [[1, 0]]);
    followPath(follower, 1, 0, 0.3);
    expect(follower.arrived).toBe(true);
    expect(follower.path).toEqual([]);
    expect(isFollowing(follower)).toBe(false);
  });

  it("도착 후 계속 호출해도 arrived 가 다시 서지 않는다 (상호작용 중복 실행 방지)", () => {
    const follower = createPathFollower();
    setPath(follower, [[1, 0]]);
    followPath(follower, 1, 0, 0.3);
    follower.arrived = false; // 소비하는 쪽이 내린다
    followPath(follower, 1, 0, 0.3);
    followPath(follower, 1, 0, 0.3);
    expect(follower.arrived).toBe(false);
  });

  it("반환 배열은 매번 같은 인스턴스다 (프레임당 할당 회피)", () => {
    const follower = createPathFollower();
    setPath(follower, PATH);
    expect(followPath(follower, 0, 0, 0.3)).toBe(
      followPath(follower, 0, 0, 0.3),
    );
  });
});

describe("setPath / clearPath", () => {
  it("새 경로는 인덱스와 도착 플래그를 초기화한다", () => {
    const follower = createPathFollower();
    setPath(follower, PATH);
    followPath(follower, 5, 0, 0.3);
    setPath(follower, PATH, "guestbook-mailbox");
    expect(follower.index).toBe(0);
    expect(follower.arrived).toBe(false);
    expect(follower.pendingAction).toBe("guestbook-mailbox");
  });

  it("clearPath 는 예약된 상호작용도 취소한다", () => {
    const follower = createPathFollower();
    setPath(follower, PATH, "guestbook-mailbox");
    clearPath(follower);
    expect(isFollowing(follower)).toBe(false);
    expect(follower.pendingAction).toBeNull();
  });
});
