import { describe, expect, it } from "vitest";
import { leaseNextJob } from "../src/services/job-leasing.js";

describe("job leasing", () => {
  it("requires a positive integral lease duration before opening a transaction", async () => {
    await expect(leaseNextJob({ db: undefined, workerId: "worker-1", leaseSeconds: 0 })).rejects.toThrow(
      "leaseSeconds must be a positive integer"
    );
  });
});
