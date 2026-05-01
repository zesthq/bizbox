import { describe, expect, it } from "vitest";
import {
  agentRuntimeKindSchema,
  putRuntimeInstanceSchema,
  listRuntimeInstancesQuerySchema,
} from "./agent-runtime.js";

describe("agentRuntimeKindSchema", () => {
  it.each([
    "runtime_host",
    "agent_identity",
    "agent_bundle",
    "mcp_server",
    "config_profile",
    "secret_bundle",
  ] as const)("accepts the %s kind", (kind) => {
    expect(agentRuntimeKindSchema.safeParse(kind).success).toBe(true);
  });

  it("rejects legacy skill_pack alias (no migration path; must use agent_bundle)", () => {
    expect(agentRuntimeKindSchema.safeParse("skill_pack").success).toBe(false);
  });

  it("rejects unknown kinds", () => {
    expect(agentRuntimeKindSchema.safeParse("frobnicate").success).toBe(false);
  });
});

describe("putRuntimeInstanceSchema", () => {
  it("accepts a minimal payload", () => {
    const result = putRuntimeInstanceSchema.safeParse({ kind: "agent_bundle" });
    expect(result.success).toBe(true);
  });

  it("accepts plan, desiredConfig, and secret refs", () => {
    const result = putRuntimeInstanceSchema.safeParse({
      kind: "agent_bundle",
      plan: "skills_only",
      desiredConfig: { skills: ["pdf"] },
      secretRefs: [{ key: "anthropicApiKey", ref: "secret://abc" }],
    });
    expect(result.success).toBe(true);
  });

  it("rejects unknown top-level fields (strict)", () => {
    const result = putRuntimeInstanceSchema.safeParse({
      kind: "agent_bundle",
      rawSecret: "no-no",
    });
    expect(result.success).toBe(false);
  });

  it("rejects oversized secretRefs arrays", () => {
    const refs = Array.from({ length: 100 }, (_, i) => ({
      key: `k${i}`,
      ref: `r${i}`,
    }));
    const result = putRuntimeInstanceSchema.safeParse({
      kind: "agent_bundle",
      secretRefs: refs,
    });
    expect(result.success).toBe(false);
  });
});

describe("listRuntimeInstancesQuerySchema", () => {
  it("accepts an empty query", () => {
    expect(listRuntimeInstancesQuerySchema.safeParse({}).success).toBe(true);
  });

  it("accepts a kind filter", () => {
    expect(
      listRuntimeInstancesQuerySchema.safeParse({ kind: "agent_bundle" })
        .success,
    ).toBe(true);
  });

  it("rejects extra query keys", () => {
    expect(
      listRuntimeInstancesQuerySchema.safeParse({ extra: "x" }).success,
    ).toBe(false);
  });
});
