"use client";

import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import { registerReactionHandler } from "@/game/net/roomEvents";
import { serverNow } from "@/game/net/serverClock";
import { CYCLE_SECONDS } from "@/game/world/dayNight";
import { shellsToFire } from "@/game/world/nightShow";
import { setParticleEmitter } from "@/game/world/particleBus";
import { buildBurst } from "@/game/world/reactionBursts";
import { ReactionPool } from "@/game/world/reactionPool";

/**
 * 감정표현 파티클을 씬에 붙인다.
 *
 * 풀 하나 = 드로우콜 하나. 입자가 천 개든 이만 개든 이 숫자는 안 변한다.
 *
 * 처음엔 불꽃을 더하기 합성으로 따로 그리려고 풀을 둘로 나눴는데, 대낮 하늘
 * 위에서 더하기 합성은 전부 흰 점이 됐다. 합성 방식이 하나면 풀도 하나면 된다.
 *
 * ⚠ 한때 터지는 순간 `pointLight` 두 개로 섬 전체를 번쩍이게 했다. 밤바다 사진처럼
 *   그럴싸했지만 화면에서는 색이 날아가 하얀 얼룩이 됐고, 그 얼룩이 정작 봐야 할
 *   **원의 모양을 덮었다.** 빼고 나니 모든 머티리얼의 조명 계산도 같이 가벼워졌다.
 */
/**
 * 링버퍼 크기.
 *
 * 밤의 큰 발 하나가 3차 연쇄까지 합쳐 만 개 남짓이고 그게 대여섯 발 겹친다.
 * 넘치면 터지는 대신 가장 오래된 입자를 덮어쓰지만, 그러면 먼저 오른 발이
 * 한창 타는 중에 지워진다 — 한 번의 연출이 통째로 살아남을 만큼은 잡아둔다.
 *
 * 비용은 개수에 거의 안 붙는다. 죽은 입자는 정점 셰이더 첫 줄에서 화면 밖으로
 * 접히고, 살아 있는 것도 2~5px 짜리 점이라 픽셀 부담이 없다. 메모리 6.4MB.
 */
const CAPACITY = 80000;

export function Reactions() {
  const pool = useMemo(() => new ReactionPool(CAPACITY), []);
  const height = useThree((state) => state.size.height);

  useEffect(() => {
    return () => pool.dispose();
  }, [pool]);

  // 픽셀 크기 환산에 뷰포트 높이가 필요하다. 창을 줄이면 입자도 같이 작아져야 한다.
  useEffect(() => {
    pool.setViewportHeight(height);
  }, [pool, height]);

  /**
   * 네트워크를 안 타는 연출(물보라 등)이 풀에 직접 쓸 수 있게 문을 열어둔다.
   * 드로우콜은 여전히 하나다 — 같은 링버퍼에 얹히기 때문이다.
   */
  useEffect(() => {
    setParticleEmitter((specs) => pool.emit(specs, pool.now));
    return () => setParticleEmitter(null);
  }, [pool]);

  useEffect(() => {
    return registerReactionHandler((burst) => {
      // 셰이더와 같은 시계를 써야 delay 가 맞는다. useFrame 이 매 프레임 넣어준다.
      pool.emit(
        buildBurst(burst.kind, burst.x, burst.z, Math.random, burst.power),
        pool.now,
      );
    });
  }, [pool]);

  /** 이미 쏜 발. 같은 발을 두 번 쏘지 않으려고 기억한다. */
  const fired = useRef(new Set<string>());
  const lastCheck = useRef(0);

  useFrame((state) => {
    pool.setTime(state.clock.elapsedTime);

    /**
     * 밤의 자동 불꽃놀이.
     *
     * 누군가 "지금 쏴" 라고 알리는 방식이면 그 사람이 나가는 순간 연출이 멈춘다.
     * 시각만으로 정해지면 아무도 책임지지 않아도 모두가 같은 순간에 같은 걸 본다.
     */
    const now = serverNow() / 1000;
    // 첫 프레임엔 지난 간격을 모른다. 짧게 잡아 과거의 발을 몰아 쏘지 않게 한다.
    const since = lastCheck.current === 0 ? 0.05 : now - lastCheck.current;
    lastCheck.current = now;

    for (const shot of shellsToFire(now, CYCLE_SECONDS, since)) {
      if (fired.current.has(shot.key)) continue;
      fired.current.add(shot.key);
      // 기억이 무한정 쌓이지 않게 잘라낸다. 지난 밤의 발은 어차피 다시 안 나온다.
      if (fired.current.size > 64) fired.current.clear();
      pool.emit(
        buildBurst(shot.kind, shot.at[0], shot.at[1], Math.random, shot.power),
        pool.now,
      );
    }
  });

  return (
    <points
      geometry={pool.geometry}
      material={pool.material}
      frustumCulled={false}
      renderOrder={20}
    />
  );
}
