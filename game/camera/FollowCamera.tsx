"use client";

import { useFrame, useThree } from "@react-three/fiber";
import { damp3 } from "maath/easing";
import { type RefObject, useEffect, useRef } from "react";
import { type Group, PerspectiveCamera, Vector3 } from "three";
import { getCameraShot } from "./cinematic";
import { zoomOutForAspect } from "./framing";

export interface FollowCameraProps {
  targetRef: RefObject<Group | null>;
  /** 시야각(도). 동물의숲 느낌의 절반은 여기서 나온다 — 25~35 사이를 써 보라. */
  fov: number;
  /** 대상까지의 거리(m). fov 를 좁힐수록 거리를 늘려야 화면 크기가 유지된다. */
  distance: number;
  /** 부감 각도(도). 0 이면 수평, 90 이면 완전 탑다운. 40 근처가 기준점. */
  pitchDeg: number;
  /** 발이 아니라 가슴께를 보도록 올려주는 높이(m). */
  height: number;
  /** damp3 의 smoothTime(초). 목표에 도달하는 데 걸리는 대략의 시간. */
  smoothTime: number;
}

/**
 * 캐릭터를 따라가는 고정 방향 카메라.
 *
 * 캐릭터와 함께 회전하지 **않는다**. 동물의숲 카메라는 방위가 고정이고,
 * 그래서 "지도 위의 한 장면"처럼 읽힌다. 캐릭터를 따라 도는 3인칭 카메라를 붙이는 순간
 * 액션 게임처럼 보이기 시작한다.
 *
 * 위치 갱신은 damp3 로 한다. lerp(pos, target, 0.1) 을 쓰면 모니터 주사율에 따라
 * 추적 지연이 달라진다 — 120Hz 에서 딱 붙고 30fps 에서 질질 끌린다. (기획서 §4.2)
 */
/**
 * 진입 인트로.
 *
 * 처음 2.6초 동안 섬을 한 바퀴 돌며 내려앉는다. 새로고침하자마자 캐릭터 뒤에
 * 딱 붙어 있으면 "여기가 어디인지"를 볼 기회가 없다 — 한 번은 전체를 보여줘야
 * 그 다음부터 방향 감각이 생긴다.
 */
const INTRO_MS = 2600;
const INTRO_START_DISTANCE = 78;
const INTRO_START_PITCH = 46;

/** 연출에서 풀려난 뒤 이 시간 동안은 천천히 제자리로 돌아온다(ms). */
const RETURN_MS = 1400;

/** 0→1 을 부드럽게. 시작과 끝이 모두 느려야 "연출"로 읽힌다. */
function easeInOut(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2;
}

export function FollowCamera({
  targetRef,
  fov,
  distance,
  pitchDeg,
  height,
  smoothTime,
}: FollowCameraProps) {
  const camera = useThree((state) => state.camera);
  const startedAt = useRef(performance.now());
  /** 지금 적용 중인 시야각. 연출이 넓혔다 좁혔다 하므로 매 프레임 감쇠시킨다. */
  const activeFov = useRef(fov);
  /** 연출이 카메라를 놓아준 시각과 그때의 미끄러짐. 돌아오는 길에 쓴다. */
  const leftShotAt = useRef(-RETURN_MS);
  const leftGlide = useRef(0);

  // 프레임마다 Vector3 를 새로 만들면 GC 가 초당 수백 개를 치운다. 두 개를 재사용한다.
  const desired = useRef(new Vector3()).current;
  const focus = useRef(new Vector3()).current;
  const lookAt = useRef(new Vector3()).current;

  useEffect(() => {
    if (!(camera instanceof PerspectiveCamera)) return;
    camera.fov = fov;
    // 이걸 빼먹으면 슬라이더를 움직여도 화면이 안 바뀐다. FOV 튜닝할 때 제일 먼저 막히는 지점.
    camera.updateProjectionMatrix();
  }, [camera, fov]);

  useFrame((state, delta) => {
    const target = targetRef.current;
    if (!target) return;

    // 인트로가 끝나면 progress 가 1 로 고정되어 이 계산은 사실상 사라진다.
    const progress = Math.min(
      1,
      (performance.now() - startedAt.current) / INTRO_MS,
    );
    const eased = easeInOut(progress);
    const introSpin = (1 - eased) * Math.PI * 0.55;

    /**
     * 화면이 세로로 길수록 물러난다. fov 는 세로 화각이라 세로 폰에서는
     * 가로가 통째로 좁아지는데, 거리를 늘리는 게 가로를 넓히는 유일한 손잡이다.
     * 매 프레임 다시 재므로 화면을 돌리면 그 자리에서 따라온다.
     */
    const zoomed =
      distance * zoomOutForAspect(state.size.width / state.size.height);
    const activeDistance =
      INTRO_START_DISTANCE + (zoomed - INTRO_START_DISTANCE) * eased;
    const activePitch =
      INTRO_START_PITCH + (pitchDeg - INTRO_START_PITCH) * eased;
    // 인트로 중에는 즉시 붙어야 궤도가 매끄럽다. 감쇠는 끝난 뒤에만 건다.
    const activeSmooth = smoothTime * eased;

    const pitch = (activePitch * Math.PI) / 180;
    const horizontal = Math.cos(pitch) * activeDistance;
    desired.set(
      target.position.x + Math.sin(introSpin) * horizontal,
      target.position.y + height + Math.sin(pitch) * activeDistance,
      target.position.z + Math.cos(introSpin) * horizontal,
    );
    lookAt.set(
      target.position.x,
      target.position.y + height,
      target.position.z,
    );

    /**
     * 연출이 카메라를 가져갔으면 목표만 갈아 끼운다.
     *
     * 전환 애니메이션을 따로 만들 필요가 없다 — 위치도 초점도 이미 감쇠로
     * 따라가고 있으므로, 목표를 바꾸고 감쇠 시간을 늘리면 그게 곧 미끄러지는
     * 카메라다. 돌아올 때도 같은 식이라 되돌리는 코드가 따로 없다.
     */
    const shot = getCameraShot();
    let smooth = activeSmooth;
    let wantFov = fov;
    if (shot) {
      desired.set(shot.px, shot.py, shot.pz);
      if (shot.anchor) {
        /**
         * 세로로 긴 화면에서는 주인공에게서 더 물러난다.
         * 따라다니는 카메라가 쓰는 것과 **같은 곡선**이라, 폰에서 갑자기
         * 다른 규칙으로 움직이는 컷이 생기지 않는다.
         */
        const [ax, ay, az] = shot.anchor;
        const zoom = zoomOutForAspect(state.size.width / state.size.height);
        desired.set(
          ax + (shot.px - ax) * zoom,
          ay + (shot.py - ay) * zoom,
          az + (shot.pz - az) * zoom,
        );
      }
      lookAt.set(shot.tx, shot.ty, shot.tz);
      smooth = shot.glide;
      wantFov = shot.fov;
      leftShotAt.current = performance.now();
      leftGlide.current = shot.glide;
    } else if (performance.now() - leftShotAt.current < RETURN_MS) {
      /**
       * 돌아올 때도 같은 속도로 미끄러진다.
       *
       * 이게 없으면 일어서는 순간 카메라가 **툭** 하고 제자리로 돌아온다 —
       * 갈 때는 연출이었는데 올 때는 사고처럼 보인다.
       */
      smooth = leftGlide.current;
    }

    damp3(camera.position, desired, smooth, delta);
    // 바라보는 지점도 같이 감쇠시킨다. 위치만 부드럽게 하고 lookAt 을 즉시 옮기면
    // 화면 중심이 미세하게 떨린다.
    damp3(focus, lookAt, smooth, delta);
    camera.lookAt(focus);

    if (camera instanceof PerspectiveCamera) {
      const next =
        camera.fov + (wantFov - camera.fov) * Math.min(1, delta / 0.55);
      if (Math.abs(next - camera.fov) > 0.002) {
        camera.fov = next;
        camera.updateProjectionMatrix();
      }
      activeFov.current = next;
    }
  });

  return null;
}
