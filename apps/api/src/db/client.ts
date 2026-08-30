import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import type { AppConfig } from "../config.js";
import * as schema from "./schema.js";

export function createDatabase(config: Pick<AppConfig, "DATABASE_URL">) {
  const pool = new Pool({ connectionString: config.DATABASE_URL });
  return {
    db: drizzle(pool, { schema }),
    pool
  };
}

export type Database = ReturnType<typeof createDatabase>["db"];

