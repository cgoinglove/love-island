import "server-only";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { getEnv } from "@/server/env";

/**
 * 커넥션 풀은 인스턴스당 하나만 만든다.
 *
 * 개발 중엔 Next 의 HMR 이 모듈을 다시 평가하면서 풀이 계속 쌓인다 —
 * 몇 번 저장하면 Postgres 의 max_connections(기본 100)를 넘겨 접속이 거부된다.
 * globalThis 에 걸어두면 리로드를 넘어 살아남는다.
 */
const globalForDb = globalThis as unknown as { __islandPool?: Pool };

function getPool(): Pool {
  if (!globalForDb.__islandPool) {
    globalForDb.__islandPool = new Pool({
      connectionString: getEnv().DATABASE_URL,
      // Vercel 서버리스는 인스턴스가 수시로 생겼다 사라진다.
      // 인스턴스당 커넥션을 적게 잡아야 DB 쪽 한도를 안 넘긴다.
      max: 3,
      idleTimeoutMillis: 10_000,
      connectionTimeoutMillis: 5_000,
    });
  }
  return globalForDb.__islandPool;
}

/**
 * drizzle 1.0 은 `schema` 옵션을 받지 않는다 — 관계형 쿼리(db.query.*)를 쓸 때만
 * `relations` 를 넘긴다. 여기서는 select/insert 빌더만 쓰므로 클라이언트만 주면 된다.
 */
export function getDb() {
  return drizzle({ client: getPool() });
}
