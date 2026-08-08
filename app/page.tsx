import { GameStage } from "./_scene/GameStage";

/**
 * 라우트는 최대한 얇게. 씬을 하나 마운트하는 것 말고는 아무것도 하지 않는다. (기획서 §3)
 */
export default function Home() {
  return <GameStage />;
}
