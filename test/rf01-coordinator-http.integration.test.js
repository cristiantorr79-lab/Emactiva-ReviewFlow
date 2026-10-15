import assert from "node:assert/strict";
import test from "node:test";
import { createRf01CoordinatorHttpHandler } from "../src/rf01-coordinator-http-service.js";

const enabled = process.env.RF01_PG_HTTP_TEST === "YES" && Boolean(process.env.RF01_PG_TEST_URL);

test("HTTP coordinator keeps a real PostgreSQL session while WhatsApp stays simulated", { skip: !enabled }, async () => {
  const { Pool } = await import("pg");
  const pool = new Pool({ connectionString: process.env.RF01_PG_TEST_URL, max: 2, connectionTimeoutMillis: 5000 });
  const token = "synthetic-http-integration-token-minimum-32";
  const suffix = `${Date.now()}-${process.pid}`;
  const serviceId = `http-test-${suffix}`;
  const handler = createRf01CoordinatorHttpHandler({
    connect: () => pool.connect(), serviceToken: token,
    send: async ({ signal }) => signal.aborted ? { status: "ambiguous", resultCode: "WA_TIMEOUT" } : { status: "accepted", acceptedAt: new Date().toISOString() },
  });
  try {
    const result = await handler({
      method: "POST", path: "/v1/operations/outgoing", authorization: `Bearer ${token}`,
      body: { apiVersion: "v1", operation: { executionId: `execution-${suffix}`, serviceId, operationKind: "request", operationRef: `rf01:${serviceId}:request` }, message: { phoneE164: "+12025550101", customerName: "Synthetic", reviewLink: "https://example.test/review" } },
    });
    assert.equal(result.status, 200); assert.equal(result.body.outcome, "accepted");
  } finally { await pool.end(); }
});
