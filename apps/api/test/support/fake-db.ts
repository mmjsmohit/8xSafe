/**
 * A minimal, purpose-built double for the slice of the Drizzle query builder these route
 * tests exercise. It is keyed by the actual imported table object (not a string name), so
 * a test only needs to say "querying `users` returns these rows" without reproducing
 * Drizzle's WHERE-clause semantics. It is not a general-purpose Drizzle emulator — it only
 * supports the call shapes `apps/api/src/routes/*.ts` actually uses.
 */

export type FakeRow = Record<string, unknown>;

function rowsChain<T extends FakeRow>(rows: T[]) {
  const promise = Promise.resolve(rows);
  return Object.assign(promise, {
    where: () => rowsChain(rows),
    orderBy: () => rowsChain(rows),
    limit: (count: number) => rowsChain(rows.slice(0, count))
  });
}

function insertChain<T extends FakeRow>(resultRows: T[]) {
  const promise = Promise.resolve();
  return Object.assign(promise, {
    onConflictDoNothing: () => ({ returning: () => rowsChain(resultRows) }),
    returning: () => rowsChain(resultRows)
  });
}

/**
 * Builds a `Map<unknown, FakeRow[]>` from `[table, rows]` pairs. Prefer this over a bare
 * `new Map([...])` literal at call sites — mixing several distinct Drizzle table types in
 * one array literal defeats `Map`'s generic inference (contextual typing doesn't reach
 * constructor calls), which otherwise surfaces as a confusing overload-resolution error.
 */
export function tableRows(entries: (readonly [unknown, FakeRow[]])[]): Map<unknown, FakeRow[]> {
  return new Map(entries);
}

export type FakeDbSetup = {
  /** Rows returned for every `select().from(table)...` against this table. */
  tables?: Map<unknown, FakeRow[]>;
  /** Rows `insert(table).values(...).returning()` / `.onConflictDoNothing().returning()` yields. Defaults to empty (simulates a conflict). */
  insertReturns?: Map<unknown, FakeRow[]>;
};

/**
 * Named explicitly (rather than inferred via `typeof db`) so `transaction`'s callback
 * parameter isn't a self-referential type — that collapses to `any` under strict
 * type-checking and defeats the point of this being a typed test double.
 */
export type FakeDb = {
  select: () => { from: (table: unknown) => ReturnType<typeof rowsChain<FakeRow>> };
  insert: (table: unknown) => { values: (values: FakeRow | FakeRow[]) => ReturnType<typeof insertChain<FakeRow>> };
  update: (table: unknown) => { set: (values: FakeRow) => { where: () => Promise<void> } };
  transaction: <T>(callback: (tx: FakeDb) => Promise<T> | T) => Promise<T>;
};

export function createFakeDb(setup: FakeDbSetup = {}) {
  const tables = setup.tables ?? new Map<unknown, FakeRow[]>();
  const insertReturns = setup.insertReturns ?? new Map<unknown, FakeRow[]>();
  const updates: { table: unknown; values: FakeRow }[] = [];
  const inserts: { table: unknown; values: FakeRow[] }[] = [];

  const db: FakeDb = {
    select: () => ({
      from: (table: unknown) => rowsChain(tables.get(table) ?? [])
    }),
    insert: (table: unknown) => ({
      values: (values: FakeRow | FakeRow[]) => {
        const rows = Array.isArray(values) ? values : [values];
        inserts.push({ table, values: rows });
        return insertChain(insertReturns.get(table) ?? []);
      }
    }),
    update: (table: unknown) => ({
      set: (values: FakeRow) => ({
        where: () => {
          updates.push({ table, values });
          return Promise.resolve();
        }
      })
    }),
    transaction: (callback) => Promise.resolve(callback(db))
  };

  return { db, tables, insertReturns, updates, inserts };
}
