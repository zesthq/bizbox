import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createLocalAgentJwt, createWorkflowDelegatedAgentJwt, verifyLocalAgentJwt } from "../agent-auth-jwt.js";

describe("agent local JWT", () => {
  const secretEnv = "BIZBOX_AGENT_JWT_SECRET";
  const betterAuthSecretEnv = "BETTER_AUTH_SECRET";
  const ttlEnv = "BIZBOX_AGENT_JWT_TTL_SECONDS";
  const issuerEnv = "BIZBOX_AGENT_JWT_ISSUER";
  const audienceEnv = "BIZBOX_AGENT_JWT_AUDIENCE";
  const delegationTtlEnv = "BIZBOX_WORKFLOW_AGENT_JWT_TTL_SECONDS";

  const originalEnv = {
    secret: process.env[secretEnv],
    betterAuthSecret: process.env[betterAuthSecretEnv],
    ttl: process.env[ttlEnv],
    issuer: process.env[issuerEnv],
    audience: process.env[audienceEnv],
    delegationTtl: process.env[delegationTtlEnv],
  };

  beforeEach(() => {
    process.env[secretEnv] = "test-secret";
    delete process.env[betterAuthSecretEnv];
    process.env[ttlEnv] = "3600";
    delete process.env[issuerEnv];
    delete process.env[audienceEnv];
    delete process.env[delegationTtlEnv];
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    if (originalEnv.secret === undefined) delete process.env[secretEnv];
    else process.env[secretEnv] = originalEnv.secret;
    if (originalEnv.betterAuthSecret === undefined) delete process.env[betterAuthSecretEnv];
    else process.env[betterAuthSecretEnv] = originalEnv.betterAuthSecret;
    if (originalEnv.ttl === undefined) delete process.env[ttlEnv];
    else process.env[ttlEnv] = originalEnv.ttl;
    if (originalEnv.issuer === undefined) delete process.env[issuerEnv];
    else process.env[issuerEnv] = originalEnv.issuer;
    if (originalEnv.audience === undefined) delete process.env[audienceEnv];
    else process.env[audienceEnv] = originalEnv.audience;
    if (originalEnv.delegationTtl === undefined) delete process.env[delegationTtlEnv];
    else process.env[delegationTtlEnv] = originalEnv.delegationTtl;
  });

  it("creates and verifies a token", () => {
    vi.setSystemTime(new Date("2026-01-01T00:00:00.000Z"));
    const token = createLocalAgentJwt("agent-1", "company-1", "claude_local", "run-1");
    expect(typeof token).toBe("string");

    const claims = verifyLocalAgentJwt(token!);
    expect(claims).toMatchObject({
      sub: "agent-1",
      company_id: "company-1",
      adapter_type: "claude_local",
      run_id: "run-1",
      iss: "paperclip",
      aud: "paperclip-api",
    });
  });

  it("returns null when secret is missing", () => {
    process.env[secretEnv] = "";
    const token = createLocalAgentJwt("agent-1", "company-1", "claude_local", "run-1");
    expect(token).toBeNull();
    expect(verifyLocalAgentJwt("abc.def.ghi")).toBeNull();
  });

  it("falls back to BETTER_AUTH_SECRET when BIZBOX_AGENT_JWT_SECRET is absent", () => {
    delete process.env[secretEnv];
    process.env[betterAuthSecretEnv] = "fallback-secret";
    vi.setSystemTime(new Date("2026-01-01T00:00:00.000Z"));
    const token = createLocalAgentJwt("agent-1", "company-1", "claude_local", "run-1");
    expect(typeof token).toBe("string");

    const claims = verifyLocalAgentJwt(token!);
    expect(claims).toMatchObject({
      sub: "agent-1",
      company_id: "company-1",
      adapter_type: "claude_local",
      run_id: "run-1",
    });
  });

  it("rejects expired tokens", () => {
    process.env[ttlEnv] = "1";
    vi.setSystemTime(new Date("2026-01-01T00:00:00.000Z"));
    const token = createLocalAgentJwt("agent-1", "company-1", "claude_local", "run-1");

    vi.setSystemTime(new Date("2026-01-01T00:00:05.000Z"));
    expect(verifyLocalAgentJwt(token!)).toBeNull();
  });

  it("rejects issuer/audience mismatch", () => {
    process.env[issuerEnv] = "custom-issuer";
    process.env[audienceEnv] = "custom-audience";
    vi.setSystemTime(new Date("2026-01-01T00:00:00.000Z"));
    const token = createLocalAgentJwt("agent-1", "company-1", "codex_local", "run-1");

    process.env[issuerEnv] = "paperclip";
    process.env[audienceEnv] = "paperclip-api";
    expect(verifyLocalAgentJwt(token!)).toBeNull();
  });

  it("binds workflow delegations and expires them independently of heartbeat JWTs", () => {
    vi.setSystemTime(new Date("2026-01-01T00:00:00.000Z"));
    const delegated = createWorkflowDelegatedAgentJwt("agent-1", "company-1", "workflow-1", "run-1");
    const ordinary = createLocalAgentJwt("agent-1", "company-1", "claude_local", "heartbeat-1");
    expect(verifyLocalAgentJwt(delegated ?? "")).toMatchObject({
      delegation: "workflow", workflow_id: "workflow-1", run_id: "run-1", sub: "agent-1", company_id: "company-1",
      exp: Math.floor(Date.now() / 1000) + 28800,
    });
    expect(verifyLocalAgentJwt(ordinary ?? "")?.delegation).toBeUndefined();
    process.env[delegationTtlEnv] = "2";
    const short = createWorkflowDelegatedAgentJwt("agent-1", "company-1", "workflow-1", "run-2");
    vi.setSystemTime(new Date("2026-01-01T00:00:04.000Z"));
    expect(verifyLocalAgentJwt(short ?? "")).toBeNull();
    expect(verifyLocalAgentJwt(ordinary ?? "")?.run_id).toBe("heartbeat-1");
    expect(verifyLocalAgentJwt(`${delegated?.slice(0, -2)}xx`)).toBeNull();
  });
});
