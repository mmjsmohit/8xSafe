import { sql } from "drizzle-orm";
import { z } from "zod";
import type { Database } from "../db/client.js";

const leasedJobSchema = z.object({
  id: z.uuid(),
  type: z.string(),
  payload: z.unknown(),
  attempts: z.coerce.number().int(),
  maxAttempts: z.coerce.number().int(),
  leasedUntil: z.coerce.date()
});

export type LeasedJob = z.infer<typeof leasedJobSchema>;

export async function leaseNextJob(input: {
  db: Database;
  workerId: string;
  leaseSeconds: number;
}): Promise<LeasedJob | null> {
  if (!Number.isInteger(input.leaseSeconds) || input.leaseSeconds < 1) {
    throw new Error("leaseSeconds must be a positive integer");
  }
  return input.db.transaction(async (tx) => {
    const result = await tx.execute(sql`
      WITH next_job AS (
        SELECT id
        FROM jobs
        WHERE (status = 'pending' AND available_at <= NOW())
          OR (status = 'leased' AND leased_until <= NOW())
        ORDER BY available_at ASC, created_at ASC
        FOR UPDATE SKIP LOCKED
        LIMIT 1
      )
      UPDATE jobs
      SET status = 'leased',
          lease_owner = ${input.workerId},
          leased_until = NOW() + ${input.leaseSeconds} * INTERVAL '1 second',
          attempts = attempts + 1,
          updated_at = NOW()
      WHERE id = (SELECT id FROM next_job)
      RETURNING id, type, payload, attempts, max_attempts AS "maxAttempts", leased_until AS "leasedUntil"
    `);
    const row = result.rows[0];
    return row === undefined ? null : leasedJobSchema.parse(row);
  });
}
