import { describe, expect, it } from "vitest";
import {
  lastSnapshotTime,
  type Pose,
  pushSnapshot,
  type Snapshot,
  sample,
} from "./interpolation";

const snap = (t: number, x: number, z = 0, yaw = 0): Snapshot => ({
  t,
  x,
  z,
  yaw,
});
const pose = (): Pose => ({ x: 0, z: 0, yaw: 0 });

describe("pushSnapshot", () => {
  it("시간순으로 쌓인다", () => {
    const buffer: Snapshot[] = [];
    pushSnapshot(buffer, snap(100, 1));
    pushSnapshot(buffer, snap(200, 2));
    expect(buffer.map((s) => s.t)).toEqual([100, 200]);
  });

  it("늦게 도착한(순서가 뒤집힌) 스냅샷은 버린다", () => {
    // 이걸 받아들이면 캐릭터가 뒤로 튄다. UDP 가 아니라 HTTP 라도 응답 순서는 뒤집힐 수 있다.
    const buffer: Snapshot[] = [];
    pushSnapshot(buffer, snap(200, 2));
    pushSnapshot(buffer, snap(100, 1));
    expect(buffer.map((s) => s.t)).toEqual([200]);
  });

  it("같은 시각의 중복도 버린다", () => {
    const buffer: Snapshot[] = [];
    pushSnapshot(buffer, snap(100, 1));
    pushSnapshot(buffer, snap(100, 9));
    expect(buffer).toHaveLength(1);
    expect(buffer[0]?.x).toBe(1);
  });

  it("버퍼가 무한정 자라지 않는다", () => {
    const buffer: Snapshot[] = [];
    for (let i = 0; i < 200; i++) pushSnapshot(buffer, snap(i * 100, i));
    expect(buffer.length).toBeLessThanOrEqual(12);
    // 잘려나가는 건 항상 오래된 쪽이어야 한다.
    expect(buffer[buffer.length - 1]?.x).toBe(199);
  });
});

describe("sample", () => {
  it("아무것도 못 받았으면 false", () => {
    expect(sample([], 1000, pose())).toBe(false);
  });

  it("두 스냅샷 사이를 선형 보간한다", () => {
    const buffer = [snap(1000, 0), snap(2000, 10)];
    const out = pose();
    sample(buffer, 1500, out);
    expect(out.x).toBeCloseTo(5, 10);
  });

  it("버퍼보다 미래를 요청해도 외삽하지 않고 마지막 값에 머문다", () => {
    // 상대가 멈췄을 때 미끄러져 나갔다 되돌아오는 고무줄 현상을 막는 규칙.
    const buffer = [snap(1000, 0), snap(2000, 10)];
    const out = pose();
    sample(buffer, 9999, out);
    expect(out.x).toBe(10);
  });

  it("버퍼보다 과거를 요청하면 첫 값에 머문다", () => {
    const buffer = [snap(1000, 4), snap(2000, 10)];
    const out = pose();
    sample(buffer, 0, out);
    expect(out.x).toBe(4);
  });

  it("스냅샷이 세 개 이상이어도 맞는 구간을 고른다", () => {
    const buffer = [snap(0, 0), snap(1000, 10), snap(2000, 20), snap(3000, 30)];
    const out = pose();
    sample(buffer, 2500, out);
    expect(out.x).toBeCloseTo(25, 10);
  });

  it("시간이 흐르는 동안 위치가 단조롭게 진행한다 (뒤로 튀지 않는다)", () => {
    const buffer = [snap(0, 0), snap(1000, 10), snap(2000, 20)];
    const out = pose();
    let previous = Number.NEGATIVE_INFINITY;
    for (let t = 0; t <= 2000; t += 16) {
      sample(buffer, t, out);
      expect(out.x).toBeGreaterThanOrEqual(previous);
      previous = out.x;
    }
  });

  it("yaw 는 ±π 이음매를 짧은 쪽으로 넘는다", () => {
    const buffer = [
      snap(0, 0, 0, Math.PI - 0.1),
      snap(1000, 0, 0, -Math.PI + 0.1),
    ];
    const out = pose();
    sample(buffer, 500, out);
    // 0 을 거쳐 한 바퀴 도는 게 아니라 π 를 넘어야 한다.
    expect(Math.abs(out.yaw)).toBeCloseTo(Math.PI, 6);
  });

  it("실제 시나리오: 200ms 주기 수신 + 320ms 지연 렌더가 항상 보간 구간 안에 있다", () => {
    const buffer: Snapshot[] = [];
    const out = pose();
    let interpolated = 0;

    for (let beat = 0; beat < 10; beat++) {
      const now = beat * 200;
      pushSnapshot(buffer, snap(now, beat));

      // 지연 덕분에 두 스냅샷 사이를 그리게 된다 (= 끝값 고정이 아니다).
      const renderTime = now - 320;
      if (renderTime > 0 && sample(buffer, renderTime, out)) {
        const last = buffer[buffer.length - 1];
        if (last && renderTime < last.t) interpolated++;
      }
    }
    expect(interpolated).toBeGreaterThan(6);
  });
});

describe("lastSnapshotTime", () => {
  it("빈 버퍼는 0", () => {
    expect(lastSnapshotTime([])).toBe(0);
  });

  it("마지막 수신 시각을 준다", () => {
    expect(lastSnapshotTime([snap(100, 0), snap(400, 0)])).toBe(400);
  });
});
