import { createHash, randomUUID } from "node:crypto";
import { once } from "node:events";
import { mkdtemp } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import express from "express";
import request from "supertest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { eq } from "drizzle-orm";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { activityLog, agentApiKeys, agents, companies, createDb, workflowRuns, workflows } from "@paperclipai/db";
import { getEmbeddedPostgresTestSupport, startEmbeddedPostgresTestDatabase } from "./helpers/embedded-postgres.js";

const mockInvoke = vi.hoisted(() => vi.fn(async () => ({
  summary: "Useful final answer",
  resultJson: { stdout: "PRIVATE_RUNTIME_OUTPUT" },
  errorMessage: null as string | null,
  provider: "google", model: "gemini", usage: null,
})));
const mockLogger = vi.hoisted(() => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }));
vi.mock("../middleware/logger.js", () => ({ logger: mockLogger }));
vi.mock("@paperclipai/adapter-google-adk/server", async (importOriginal) => ({
  ...await importOriginal<typeof import("@paperclipai/adapter-google-adk/server")>(),
  invokeGoogleAdk: mockInvoke,
}));
vi.mock("../services/workflows-runtime.js", () => ({
  analyzeWorkflowProject: vi.fn(async () => ({
    pipelineDefinition: { entrypoint: "agent.py", generatedAt: new Date(0).toISOString(), phases: [] },
    sourceHash: "test",
  })),
  prepareInstrumentedWorkflowRuntime: vi.fn(async (input) => {
    const runtimeRoot = await mkdtemp(path.join(os.tmpdir(), "bizbox-mcp-runtime-"));
    return { runtimeRoot, tempRoot: path.join(runtimeRoot, "tmp"), copiedAgentPath: path.join(runtimeRoot, "agent.py"), patchedRunnerConfig: input.runnerConfig, analysis: input.analysis };
  }),
  collectWorkflowRuntimeArtifacts: vi.fn(async () => []),
}));
vi.mock("../storage/index.js", () => ({
  getStorageService: () => ({
    putFile: vi.fn(async () => ({ provider: "local_disk", objectKey: "test.md", contentType: "text/markdown", byteSize: 19, sha256: "test", originalFilename: "test.md" })),
    deleteObject: vi.fn(),
  }),
}));
vi.mock("../services/workflow-handoff-bridge.js", () => ({
  workflowHandoffBridgeService: () => ({ closeTerminalRunHandoffs: vi.fn(async () => []) }),
}));

import { mcpRoutes } from "../routes/mcp.js";
import { actorMiddleware } from "../middleware/auth.js";
import * as activity from "../services/activity-log.js";

const support = await getEmbeddedPostgresTestSupport();
if (!support.supported) console.warn(`Skipping MCP integration tests: ${support.reason}`);

(support.supported ? describe : describe.skip)("workflow MCP", () => {
  let db: ReturnType<typeof createDb>;
  let tempDb: Awaited<ReturnType<typeof startEmbeddedPostgresTestDatabase>>;
  const token = "test-only-mcp-token";
  const companyId = randomUUID();
  const otherCompanyId = randomUUID();
  const workflowId = randomUUID();
  const otherWorkflowId = randomUUID();
  const archivedId = randomUUID();

  function app(mode: "local_trusted" | "authenticated" = "local_trusted") {
    const instance = express();
    instance.use("/mcp", mcpRoutes(db, { enabled: true, allowedHostnames: ["bizbox.example"], bindHost: "127.0.0.1" }));
    instance.use(actorMiddleware(db, { deploymentMode: mode }));
    instance.get("/api/actor", (req, res) => res.json(req.actor));
    instance.get("/MCP/workflows", (_req, res) => res.send("Company workflows page"));
    return instance;
  }

  function rpc(method: string, params: Record<string, unknown> = {}, instance = app()) {
    return request(instance).post("/mcp")
      .set("Authorization", `Bearer ${token}`)
      .set("Accept", "application/json, text/event-stream")
      .send({ jsonrpc: "2.0", id: 1, method, params });
  }

  async function call(name: string, args: Record<string, unknown>) {
    const response = await rpc("tools/call", { name, arguments: args });
    expect(response.status).toBe(200);
    return response.body.result;
  }

  beforeAll(async () => {
    tempDb = await startEmbeddedPostgresTestDatabase("bizbox-mcp-");
    db = createDb(tempDb.connectionString);
    await db.insert(companies).values([
      { id: companyId, name: "MCP A", issuePrefix: "MCPA" },
      { id: otherCompanyId, name: "MCP B", issuePrefix: "MCPB" },
    ]);
    await db.insert(workflows).values([
      { id: workflowId, companyId, title: "Brief", description: "Generate a brief", capabilities: ["brief"], runnerConfig: { agentPath: "/private/agent.py", env: { API_KEY: "PRIVATE_CONFIG" } } },
      { id: otherWorkflowId, companyId: otherCompanyId, title: "Paused", status: "paused", runnerConfig: { agentPath: "/private/agent.py" } },
      { id: archivedId, companyId, title: "Archived", status: "archived", runnerConfig: { agentPath: "/private/agent.py" } },
    ]);
  }, 30_000);

  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("BIZBOX_MCP_API_KEY", token);
    vi.stubEnv("BIZBOX_WORKFLOW_JWT_SECRET", "test-only-workflow-secret");
    vi.stubEnv("BIZBOX_PUBLIC_URL", "");
  });
  afterEach(() => vi.unstubAllEnvs());
  afterAll(async () => { await tempDb?.cleanup(); });

  it("fails closed before local-trusted auth, including every HTTP method", async () => {
    vi.stubEnv("BIZBOX_MCP_API_KEY", "");
    expect((await rpc("tools/list")).status).toBe(503);
    vi.stubEnv("BIZBOX_MCP_API_KEY", token);
    const instance = app();
    for (const method of ["post", "get", "delete", "options"] as const) {
      expect((await request(instance)[method]("/mcp")).status).toBe(401);
      expect((await request(instance)[method]("/mcp").set("Authorization", "Bearer wrong")).status).toBe(401);
    }
    expect((await request(instance).post("/mcp").set("Cookie", "session=board")).status).toBe(401);
    expect((await request(instance).get("/mcp").set("Authorization", `Bearer ${token}`)).status).toBe(405);
    expect((await request(instance).get("/api/actor")).body.source).toBe("local_implicit");
  });

  it("initializes and exposes exactly five tools without a session", async () => {
    const response = await rpc("initialize", { protocolVersion: "2025-03-26", capabilities: {}, clientInfo: { name: "clickup-test", version: "1" } });
    expect(response.status).toBe(200);
    expect(response.body.result.serverInfo.name).toBe("bizbox-workflows");
    expect(response.body.result.instructions).toMatch(/list_companies.*required\/optional inputs/);
    expect(response.body.result.instructions).toContain("Never automatically retry");
    expect(response.headers["mcp-session-id"]).toBeUndefined();
    const tools = await rpc("tools/list");
    for (const tool of tools.body.result.tools) {
      expect(tool.description.length).toBeGreaterThan(40);
      for (const property of Object.values(tool.inputSchema.properties) as Array<{ description: string }>) {
        expect(property.description.length).toBeGreaterThan(20);
      }
    }
    expect((await call("run_workflow", { workflowId, inputMarkdown: "hello" })).isError).toBe(true);
    expect(tools.body.result.tools.map((tool: { name: string }) => tool.name).sort()).toEqual(["get_workflow_run", "list_companies", "list_workflow_runs", "list_workflows", "trigger_workflow_run"]);
    const initialized = await request(app()).post("/mcp").set("Authorization", `Bearer ${token}`)
      .set("Accept", "application/json, text/event-stream").send({ jsonrpc: "2.0", method: "notifications/initialized" });
    expect(initialized.status).toBe(202);
  });

  it("does not intercept a company UI path whose prefix is MCP", async () => {
    const response = await request(app()).get("/MCP/workflows");
    expect(response.status).toBe(200);
    expect(response.text).toBe("Company workflows page");
  });

  it("keeps hostname and Origin protections", async () => {
    expect((await rpc("tools/list").set("Host", "evil.example")).status).toBe(403);
    expect((await rpc("tools/list").set("Origin", "https://evil.example")).status).toBe(403);
    expect((await rpc("tools/list").set("Origin", "null")).status).toBe(403);
    expect((await rpc("tools/list").set("Host", "bizbox.example").set("Origin", "https://bizbox.example")).status).toBe(200);
  });

  it("supports a real Streamable HTTP client from connection through final result", async () => {
    const server = app().listen(0, "127.0.0.1");
    await once(server, "listening");
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("Missing test server address");
    const client = new Client({ name: "clickup-acceptance-simulation", version: "1" });
    try {
      await client.connect(new StreamableHTTPClientTransport(new URL(`http://127.0.0.1:${address.port}/mcp`), {
        requestInit: { headers: { Authorization: `Bearer ${token}` } },
      }));
      expect((await client.listTools()).tools).toHaveLength(5);
      const listed = await client.callTool({ name: "list_workflows", arguments: { companyId } });
      expect(JSON.stringify(listed)).toContain(workflowId);
      const started = await client.callTool({ name: "trigger_workflow_run", arguments: { workflowId, inputMarkdown: "A harmless greeting" } });
      expect(started.isError).not.toBe(true);
      const content = started.content as Array<{ type: string; text: string }>;
      const { runId } = JSON.parse(content[0].text);
      await vi.waitFor(async () => {
        const result = await client.callTool({ name: "get_workflow_run", arguments: { runId } });
        const output = result.content as Array<{ type: string; text: string }>;
        expect(JSON.parse(output[0].text)).toMatchObject({ runId, status: "succeeded", outputMarkdown: "Useful final answer" });
      }, 10_000);
      await client.close();
      const fresh = new Client({ name: "fresh-conversation", version: "1" });
      try {
        await fresh.connect(new StreamableHTTPClientTransport(new URL(`http://127.0.0.1:${address.port}/mcp`), {
          requestInit: { headers: { Authorization: `Bearer ${token}` } },
        }));
        const discovered = await fresh.callTool({ name: "list_companies", arguments: {} });
        expect(JSON.stringify(discovered)).toContain(companyId);
        const history = await fresh.callTool({ name: "list_workflow_runs", arguments: { workflowId } });
        const runs = JSON.parse((history.content as Array<{ text: string }>)[0].text).runs;
        const previous = runs.find((run: { runId: string }) => run.runId === runId);
        expect(previous).toBeDefined();
        const recovered = await fresh.callTool({ name: "get_workflow_run", arguments: { runId: previous.runId } });
        expect(JSON.stringify(recovered)).toContain("Useful final answer");
        expect(mockInvoke).toHaveBeenCalledTimes(1);
      } finally {
        await fresh.close();
      }
    } finally {
      await client.close();
      await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    }
  });

  it("lists each company's workflows with only discovery fields", async () => {
    const first = JSON.parse((await call("list_workflows", { companyId })).content[0].text);
    expect(first).toEqual({ workflows: [{ workflowId, companyId, title: "Brief", description: "Generate a brief", status: "active", capabilities: ["brief"] }] });
    const second = JSON.parse((await call("list_workflows", { companyId: otherCompanyId })).content[0].text);
    expect(second.workflows[0].workflowId).toBe(otherWorkflowId);
  });

  it("lists only company discovery fields", async () => {
    const result = JSON.parse((await call("list_companies", {})).content[0].text);
    expect(result.companies).toEqual(expect.arrayContaining([
      { companyId, name: "MCP A", description: null },
      { companyId: otherCompanyId, name: "MCP B", description: null },
    ]));
    for (const company of result.companies) {
      expect(Object.keys(company).sort()).toEqual(["companyId", "description", "name"]);
    }
  });

  it("returns bounded, workflow-specific recent history with normalized status and no runtime fields", async () => {
    const historyWorkflowId = randomUUID();
    await db.insert(workflows).values({ id: historyWorkflowId, companyId, title: "History", runnerConfig: {} });
    expect(JSON.parse((await call("list_workflow_runs", { workflowId: historyWorkflowId })).content[0].text))
      .toEqual({ runs: [], historyLimit: 20, returnedCount: 0 });
    const rows = Array.from({ length: 22 }, (_, index) => ({
      id: randomUUID(), companyId, workflowId: historyWorkflowId,
      status: index === 21 ? "awaiting_final_review" : "succeeded",
      inputMarkdown: index === 21 ? "x".repeat(300) + "PRIVATE_TAIL" : "Short input",
      summary: "PRIVATE_SUMMARY",
      error: "PRIVATE_ERROR",
      contextSnapshot: { resultJson: { secret: "PRIVATE_RUNTIME" } },
      createdAt: new Date(Date.UTC(2026, 0, 1, 0, index)),
    }));
    await db.insert(workflowRuns).values(rows);
    const result = JSON.parse((await call("list_workflow_runs", { workflowId: historyWorkflowId })).content[0].text);
    expect(result.historyLimit).toBe(20);
    expect(result.returnedCount).toBe(20);
    expect(result.runs.map((run: { runId: string }) => run.runId)).toEqual(rows.slice(2).reverse().map(row => row.id));
    expect(result.runs[0]).toEqual({
      runId: rows[21].id, workflowId: historyWorkflowId, companyId, status: "awaiting_human",
      createdAt: rows[21].createdAt.toISOString(), startedAt: null, finishedAt: null,
      inputPreview: "x".repeat(300), inputPreviewTruncated: true,
    });
    expect(result.runs[1].inputPreviewTruncated).toBe(false);
    expect(JSON.stringify(result)).not.toMatch(/PRIVATE_|contextSnapshot|resultJson/);
    expect(JSON.stringify(mockLogger.info.mock.calls)).not.toContain("Short input");
    expect(JSON.parse((await call("get_workflow_run", { runId: rows[0].id })).content[0].text).status).toBe("succeeded");
    expect((await call("list_workflow_runs", { workflowId: randomUUID() })).isError).toBe(true);
    expect((await call("list_workflow_runs", { workflowId: "invalid" })).isError).toBe(true);
  });

  it("validates inputs and preserves missing/archived workflow rejection", async () => {
    for (const inputMarkdown of ["", "   ", "a".repeat(200_001), 42]) {
      expect((await call("trigger_workflow_run", { workflowId, inputMarkdown })).isError).toBe(true);
    }
    expect((await call("list_workflows", { companyId: "not-a-uuid" })).isError).toBe(true);
    expect((await call("trigger_workflow_run", { workflowId: randomUUID(), inputMarkdown: "hello" })).content[0].text).toBe("Workflow not found");
    expect((await call("trigger_workflow_run", { workflowId: archivedId, inputMarkdown: "hello" })).content[0].text).toMatch(/archived/);
    expect((await call("get_workflow_run", { runId: randomUUID() })).isError).toBe(true);
    expect(mockInvoke).not.toHaveBeenCalled();
  });

  it("starts real persisted runs across companies, logs activity, and does not deduplicate", async () => {
    const results = [];
    for (const id of [workflowId, workflowId, otherWorkflowId]) {
      const result = await call("trigger_workflow_run", { workflowId: id, inputMarkdown: "  PRIVATE_INPUT  " });
      expect(result.isError).not.toBe(true);
      results.push(JSON.parse(result.content[0].text));
    }
    expect(new Set(results.map((r) => r.runId)).size).toBe(3);
    expect(results[2].companyId).toBe(otherCompanyId);
    for (const result of results) {
      expect(Object.keys(result).sort()).toEqual(["companyId", "runId", "status", "workflowId"]);
      await vi.waitFor(async () => {
        const [row] = await db.select().from(workflowRuns).where(eq(workflowRuns.id, result.runId));
        expect(row.status).toBe("succeeded");
        expect(row.inputMarkdown).toBe("PRIVATE_INPUT");
      }, 10_000);
      const detail = JSON.parse((await call("get_workflow_run", { runId: result.runId })).content[0].text);
      expect(detail.outputMarkdown).toBe("Useful final answer");
      expect(detail).not.toHaveProperty("resultJson");
      const [activity] = await db.select().from(activityLog).where(eq(activityLog.entityId, result.runId));
      expect(activity).toMatchObject({ actorType: "system", actorId: "mcp", action: "workflow.run_started", companyId: result.companyId, details: { workflowId: result.workflowId, source: "mcp" } });
    }
    expect(mockInvoke).toHaveBeenCalledTimes(3);
    const logs = JSON.stringify([mockLogger.info.mock.calls, mockLogger.error.mock.calls]);
    expect(logs).not.toMatch(/PRIVATE_INPUT|PRIVATE_CONFIG|PRIVATE_RUNTIME_OUTPUT|Useful final answer|test-only-mcp-token/);
  });

  it("returns a run ID before execution completes, even if activity logging fails", async () => {
    let finish!: (result: Awaited<ReturnType<typeof mockInvoke>>) => void;
    mockInvoke.mockImplementationOnce(() => new Promise((resolve) => { finish = resolve; }));
    const log = vi.spyOn(activity, "logActivity").mockRejectedValueOnce(new Error("PRIVATE_ACTIVITY_ERROR"));
    let runId: string | undefined;
    try {
      const started = await call("trigger_workflow_run", { workflowId, inputMarkdown: "hello" });
      expect(started.isError).not.toBe(true);
      runId = JSON.parse(started.content[0].text).runId;
      await vi.waitFor(() => expect(finish).toBeTypeOf("function"));
      const active = JSON.parse((await call("get_workflow_run", { runId })).content[0].text);
      expect(active.status).toBe("running");
      expect(active.outputMarkdown).toBeNull();
    } finally {
      log.mockRestore();
      finish?.({ summary: "failed answer", errorMessage: "PRIVATE_RUNTIME_ERROR", resultJson: { stdout: "PRIVATE_RUNTIME_OUTPUT" }, provider: "google", model: "gemini", usage: null });
      if (runId) {
        await vi.waitFor(async () => {
          const failed = JSON.parse((await call("get_workflow_run", { runId })).content[0].text);
          expect(failed.status).toBe("failed");
          expect(failed.outputMarkdown).toBeNull();
          expect(failed.error).toBe("Workflow failed. Inspect the run in Bizbox.");
        }, 10_000);
      }
    }
    expect(JSON.stringify(mockLogger.error.mock.calls)).not.toMatch(/PRIVATE_/);
  });

  it("projects persisted lifecycle states without leaking internal data or raw failures", async () => {
    for (const status of ["queued", "running", "awaiting_human", "awaiting_content_review", "awaiting_final_review", "succeeded", "failed", "cancelled", "rejected"]) {
      const runId = randomUUID();
      await db.insert(workflowRuns).values({ id: runId, companyId, workflowId, status, inputMarkdown: "PRIVATE_INPUT", summary: "Final text", error: "PRIVATE_ERROR /secret/path", contextSnapshot: { resultJson: { secret: "PRIVATE_RESULT" }, runtimeRoot: "/secret/path" } });
      const result = await call("get_workflow_run", { runId });
      expect(JSON.parse(result.content[0].text)).toEqual({
        runId, companyId, workflowId,
        status: ["awaiting_content_review", "awaiting_final_review"].includes(status) ? "awaiting_human" : status,
        outputMarkdown: status === "succeeded" ? "Final text" : null,
        error: status === "failed" ? "Workflow failed. Inspect the run in Bizbox." : null,
      });
      expect(JSON.stringify(result)).not.toMatch(/PRIVATE_|\/secret/);
    }
  });

  it("does not pass malformed or oversized MCP bodies to REST error logging", async () => {
    for (const body of ['{"input":"PRIVATE_INPUT",', JSON.stringify({ input: "PRIVATE_INPUT".repeat(200_000) })]) {
      const response = await request(app()).post("/mcp?secret=PRIVATE_QUERY").set("Authorization", `Bearer ${token}`).set("Content-Type", "application/json").send(body);
      expect([400, 413]).toContain(response.status);
      expect(response.body).toEqual({ error: "Invalid MCP request body" });
    }
    expect(JSON.stringify(mockLogger.info.mock.calls)).not.toMatch(/PRIVATE_|test-only-mcp-token/);
  });

  it("rotates on router restart without making the MCP token a REST credential", async () => {
    const agentId = randomUUID();
    await db.insert(agents).values({ id: agentId, companyId, name: "Normal agent", role: "engineer" });
    await db.insert(agentApiKeys).values({ agentId, companyId, name: "test", keyHash: createHash("sha256").update("normal-agent-key").digest("hex") });
    const instance = app("authenticated");
    expect((await request(instance).get("/api/actor").set("Authorization", `Bearer ${token}`)).body.type).toBe("none");
    expect((await request(instance).get("/api/actor").set("Authorization", "Bearer normal-agent-key")).body.agentId).toBe(agentId);
    expect((await request(instance).post("/mcp").set("Authorization", "Bearer normal-agent-key")).status).toBe(401);
    vi.stubEnv("BIZBOX_MCP_API_KEY", "replacement-key");
    const rotated = app();
    expect((await rpc("tools/list", {}, rotated)).status).toBe(401);
    expect((await rpc("tools/list", {}, rotated).set("Authorization", "Bearer replacement-key")).status).toBe(200);
  });
});
