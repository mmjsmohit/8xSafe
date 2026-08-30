import { type SQL } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";
import { describe, expect, it } from "vitest";
import { leaseNextJob } from "../src/services/job-leasing.js";

const dialect = new PgDialect();

describe("job leasing", () => {
  it("requires a positive integral lease duration before opening a transaction", async () => {
    await expect(leaseNextJob({ db: undefined as never, workerId: "worker-1", leaseSeconds: 0 })).rejects.toThrow(
      "leaseSeconds must be a positive integer"
    );
  });

  it("uses a parameterized SKIP LOCKED transaction and returns null when no job is available", async () => {
    const statements: SQL[] = [];
    const db = {
      transaction: (callback: (transaction: { execute: (statement: SQL) => Promise<{ rows: unknown[] }> }) => unknown) =>
        Promise.resolve(callback({
          execute: (statement) => {
            statements.push(statement);
            return Promise.resolve({ rows: [] });
          }
        }))
    };

    await expect(leaseNextJob({ db: db as never, workerId: "worker-a", leaseSeconds: 45 })).resolves.toBeNull();

    expect(statements).toHaveLength(1);
    const query = dialect.sqlToQuery(statements[0]);
    expect(query.sql).toContain("FOR UPDATE SKIP LOCKED");
    expect(query.sql).toContain("status = 'pending'");
    expect(query.sql).toContain("status = 'leased'");
    expect(query.sql).toContain("lease_owner = $");
    expect(query.sql).toContain("INTERVAL '1 second'");
    expect(query.params).toEqual(["worker-a", 45]);
  });

  it("leases a retryable expired lease with its incremented attempt count", async () => {
    const db = {
      transaction: (callback: (transaction: { execute: () => Promise<{ rows: unknown[] }> }) => unknown) =>
        Promise.resolve(callback({
          execute: () => Promise.resolve({ rows: [{
            id: "77777777-7777-4777-8777-777777777777",
            type: "post_call_processing",
            payload: { callId: "22222222-2222-4222-8222-222222222222" },
            attempts: 2,
            maxAttempts: 5,
            leasedUntil: "2026-01-03T00:00:45.000Z"
          }] })
        }))
    };

    await expect(leaseNextJob({ db: db as never, workerId: "worker-b", leaseSeconds: 45 })).resolves.toMatchObject({
      id: "77777777-7777-4777-8777-777777777777",
      attempts: 2,
      maxAttempts: 5,
      payload: { callId: "22222222-2222-4222-8222-222222222222" }
    });
  });
});
