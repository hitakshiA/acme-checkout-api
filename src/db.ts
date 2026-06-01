// pg-style data access seam.
//
// In production we pass a `pg` Pool (Supabase connection string) into
// `createPgDb`. Everything above this line talks to the `Db` interface,
// so tests can supply their own Queryable without touching the network.

export interface QueryResult<T> {
  rows: T[];
  rowCount: number;
}

export interface Queryable {
  query<T = Record<string, unknown>>(
    text: string,
    params?: unknown[],
  ): Promise<QueryResult<T>>;
}

export interface Db extends Queryable {
  connect(): Promise<void>;
  end(): Promise<void>;
}

/** Structural subset of a `pg` Pool, so we don't need a hard dependency here. */
export interface PgLikePool {
  query(...args: unknown[]): Promise<{ rows: unknown[]; rowCount?: number | null }>;
  connect(): Promise<unknown>;
  end(): Promise<void>;
}

export function createPgDb(pool: PgLikePool): Db {
  return {
    async connect(): Promise<void> {
      await pool.connect();
    },
    async query<T = Record<string, unknown>>(
      text: string,
      params: unknown[] = [],
    ): Promise<QueryResult<T>> {
      const res = (await pool.query(text, params)) as {
        rows: unknown[];
        rowCount?: number | null;
      };
      return { rows: res.rows as T[], rowCount: res.rowCount ?? res.rows.length };
    },
    async end(): Promise<void> {
      await pool.end();
    },
  };
}

export class NotFoundError extends Error {
  constructor(what: string, id: string) {
    super(`${what} not found: ${id}`);
    this.name = "NotFoundError";
  }
}
