// Entry point. Kept separate from server.ts so tests can build the app
// without binding a port.

import { createApp } from "./server.ts";
import { createPgDb, type PgLikePool } from "./db.ts";

async function main(): Promise<void> {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    console.error("DATABASE_URL is required (Supabase postgres connection string)");
    process.exit(1);
  }
  // Lazily require `pg` so the repo has zero hard dependencies; production
  // images install pg.
  const pg = (await import("pg")) as unknown as { default: { Pool: new (o: object) => PgLikePool } };
  const pool = new pg.default.Pool({ connectionString, max: 10 });
  const db = createPgDb(pool);
  await db.connect();

  const app = createApp(db);
  const port = Number(process.env.PORT ?? 8080);
  app.listen(port, () => {
    console.log(`acme checkout-api listening on :${port}`);
  });

  const shutdown = async (signal: string): Promise<void> => {
    console.log(`${signal} received, draining`);
    await db.end();
    process.exit(0);
  };
  process.on("SIGTERM", () => void shutdown("SIGTERM"));
  process.on("SIGINT", () => void shutdown("SIGINT"));
}

void main();
