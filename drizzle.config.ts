import { config } from "dotenv";
import { defineConfig } from "drizzle-kit";

// Next 는 .env.local 을 자동으로 읽지만 drizzle-kit 은 그냥 노드 프로세스라 직접 읽어야 한다.
config({ path: ".env.local" });

const url = process.env.DATABASE_URL;
if (!url) {
  throw new Error("DATABASE_URL 이 없습니다. .env.local 을 확인하세요.");
}

export default defineConfig({
  schema: "./server/db/schema.ts",
  out: "./server/db/migrations",
  dialect: "postgresql",
  dbCredentials: { url },
});
