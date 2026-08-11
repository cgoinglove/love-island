"use client";

import { X } from "lucide-react";
import { useEffect, useState } from "react";
import { Panel } from "@/components/island/Panel";
import { useHudStore } from "@/game/hud/store";
import { ownerOf } from "@/shared/content";
import { currentLocale, t } from "@/shared/strings";
import { ALBUM_PANEL_ID } from "./constants";
import { albumIntroOf, type Photo, photosOf } from "./content";

/**
 * 사진첩 — **피드**로 읽는다.
 *
 * ── 왜 격자가 아니라 피드인가 ──
 * 전엔 폴라로이드 격자였다. 예뻤지만 한 장이 엄지손톱만 해서 사진을 **보는** 게
 * 아니라 사진이 있다는 걸 확인하는 화면이었다. 사진첩은 훑는 게 아니라 넘겨보는
 * 물건이고, 그 형식은 이미 모두가 손에 익혀뒀다 — 세로로 흐르는 한 줄,
 * 위에 누가 올렸는지, 아래에 무슨 사진인지.
 *
 * ── 왜 좋아요 수가 없나 ──
 * 피드 모양을 빌리되 **없는 숫자를 지어내지 않는다.** 아무도 안 누른 하트에
 * 128 이 적혀 있으면 그 순간 이 화면 전체가 못 믿을 것이 된다.
 * 빌린 건 레이아웃이지 사회적 증거가 아니다.
 */
export function AlbumPanel() {
  const isOpen = useHudStore((state) => state.openPanelId === ALBUM_PANEL_ID);
  const closePanel = useHudStore((state) => state.closePanel);
  const [zoomed, setZoomed] = useState<Photo | null>(null);

  const locale = currentLocale();
  const owner = ownerOf(locale);
  const photos = photosOf(locale);

  return (
    <>
      <Panel
        open={isOpen}
        onClose={closePanel}
        slug={t().album.slug}
        title={t().album.title}
        subtitle={albumIntroOf(locale)}
        // 제목과 피드의 왼쪽 끝이 맞아야 한 덩어리로 읽힌다.
        titleClassName="max-w-136"
        action={
          <span className="font-bold text-[13px] text-[#fdf6e8]/75 tabular-nums">
            {t().album.count(photos.length)}
          </span>
        }
      >
        {
          /**
           * 피드 폭은 화면이 아니라 **사진 한 장이 편하게 보이는 크기**가 정한다.
           * 전체화면이라고 한 장을 2560px 로 늘이면 그건 벽지지 사진첩이 아니다.
           */
          <ul className="mx-auto flex w-full max-w-136 flex-col gap-8 px-0 pb-[max(3rem,env(safe-area-inset-bottom))] sm:px-5">
            {photos.map((photo) => (
              <li
                key={photo.id}
                className="overflow-hidden border-[#e8dcc4] border-y bg-[#fffcf5] sm:rounded-2xl sm:border-2"
              >
                {/* 올린 사람. 날짜는 적었을 때만 붙는다. */}
                <div className="flex items-center gap-3 px-4 py-3">
                  <span className="flex size-9 items-center justify-center rounded-full bg-[#e8734a] font-black text-[15px] text-[#fff6ef] ring-2 ring-[#4a3428]">
                    {owner.name.slice(0, 1).toUpperCase()}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-bold text-[14px] text-[#3a2a22]">
                      {owner.name}
                    </span>
                    {photo.when && (
                      <span className="block truncate font-medium text-[12px] text-[#a8967f]">
                        {photo.when}
                      </span>
                    )}
                  </span>
                </div>

                {/*
                  사진은 **제 비율 그대로** 놓는다.
                  틀을 4:5 로 고정하고 잘라내면 가로로 찍은 사진이 40% 날아간다 —
                  피드 모양보다 사진이 온전한 게 먼저다.
                */}
                <button
                  type="button"
                  onClick={() => setZoomed(photo)}
                  className="block w-full cursor-zoom-in"
                >
                  <PhotoSurface photo={photo} className="w-full bg-[#f2e9d6]" />
                </button>

                {/* 설명은 적었을 때만. 이름을 굵게 앞에 두는 게 피드의 문법이다. */}
                {photo.caption && (
                  <p className="px-4 pt-3 pb-4 font-medium text-[15px] text-[#3a2a22] leading-relaxed">
                    <span className="font-bold">{owner.name}</span>{" "}
                    {photo.caption}
                  </p>
                )}
              </li>
            ))}
          </ul>
        }
      </Panel>

      {zoomed && <Lightbox photo={zoomed} onClose={() => setZoomed(null)} />}
    </>
  );
}

/**
 * 사진 한 장을 화면 가득. 잘라내지 않고(object-contain) 통째로 보여준다.
 */
function Lightbox({ photo, onClose }: { photo: Photo; onClose: () => void }) {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        // 라이트박스가 먼저 닫힌다. 안 막으면 패널까지 같이 닫혀 피드로 못 돌아온다.
        event.stopPropagation();
        onClose();
      }
    };
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [onClose]);

  return (
    <div className="fade-in fixed inset-0 z-40 flex animate-in flex-col bg-[#1a120c]/95 duration-150">
      <div className="flex shrink-0 justify-end p-3 pt-[max(0.75rem,env(safe-area-inset-top))]">
        <button
          type="button"
          onClick={onClose}
          aria-label={t().hud.close}
          className="rounded-full bg-white/10 p-2.5 text-white/85 transition hover:bg-white/20"
        >
          <X className="size-5" />
        </button>
      </div>

      <button
        type="button"
        onClick={onClose}
        className="flex min-h-0 flex-1 cursor-zoom-out items-center justify-center px-4"
      >
        <PhotoSurface photo={photo} className="max-h-full max-w-full" contain />
      </button>

      {(photo.caption || photo.when) && (
        <div className="shrink-0 px-6 pt-4 pb-[max(1.5rem,env(safe-area-inset-bottom))] text-center">
          {photo.caption && (
            <p className="font-bold text-[16px] text-white">{photo.caption}</p>
          )}
          {photo.when && (
            <p className="mt-0.5 font-medium text-[13px] text-white/55">
              {photo.when}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * 사진이 있으면 사진을, 없으면 색면을 그린다.
 * 자리를 채우려는 게 아니라 사진이 없어도 레이아웃이 무너지지 않게 하려는 것이다.
 */
function PhotoSurface({
  photo,
  className,
  contain = false,
}: {
  photo: Photo;
  className: string;
  contain?: boolean;
}) {
  if (photo.src) {
    return (
      // next/image 를 쓰지 않는 이유: 사용자가 public/photos/ 에 아무 크기나 넣는데
      // 그때마다 sizes 를 맞춰줄 방법이 없다. 사진첩은 몇 장뿐이라 이게 낫다.
      // biome-ignore lint/performance/noImgElement: 사용자가 직접 넣는 임의 크기 이미지
      <img
        src={photo.src}
        alt={photo.caption ?? ""}
        // 목록의 아래쪽 사진은 화면에 들어올 때 받는다. 열자마자 15장을 다 받으면 느리다.
        loading="lazy"
        decoding="async"
        className={`${className} ${contain ? "object-contain" : "h-auto"}`}
      />
    );
  }
  return (
    <div
      className={`${className} flex items-center justify-center ${contain ? "aspect-4/5 w-full max-w-lg rounded-2xl" : ""}`}
      style={{ background: `linear-gradient(140deg, ${photo.tint}, #ffffff)` }}
    >
      <span className="text-3xl opacity-40">🖼️</span>
    </div>
  );
}
