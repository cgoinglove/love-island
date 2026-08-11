"use client";

import { AlbumPanel, Easel } from "@/features/album";
import { CareerPanel, Desk } from "@/features/career";
import { FishingHud, FishingSpot, Tackle } from "@/features/fishing";
import { Board, GuestbookNotes, GuestbookPanel } from "@/features/guestbook";
import { GameCanvas } from "@/game/GameCanvas";
import { Hud } from "@/game/hud/Hud";

/**
 * 합성 루트.
 *
 * 여기가 game/ 과 features/ 를 아는 **유일한** 자리다.
 * game/GameCanvas 는 features 를 모르고(린트가 막는다), feature 끼리도 서로를 모른다.
 * 셋을 이어 붙이는 책임을 app/ 한 곳에 몰아두면, 기능을 빼고 넣는 게
 * 이 파일에서 줄을 지우고 더하는 일이 된다. (기획서 §2.2)
 *
 * feature 는 index.ts 를 통해서만 들어온다 — 내부 파일 경로를 쓰면 린트가 에러를 낸다.
 */
export function IslandScene({ onReady }: { onReady: () => void }) {
  return (
    <GameCanvas
      onReady={onReady}
      overlay={
        <>
          <Hud />
          <GuestbookPanel />
          <CareerPanel />

          <AlbumPanel />
          <FishingHud />
        </>
      }
    >
      <Board />
      <GuestbookNotes />
      <Desk />
      <FishingSpot />
      <Tackle />
      <Easel />
    </GameCanvas>
  );
}
