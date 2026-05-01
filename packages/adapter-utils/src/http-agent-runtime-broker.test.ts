import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createServer, type Server } from "node:http";
import { AddressInfo } from "node:net";
import {
  createHttpAgentRuntimeBroker,
  type BrokerCallContext,
} from "./index.js";

interface RecordedRequest {
  method: string;
  url: string;
  headers: Record<string, string>;
  body: string;
}

interface FixtureServer {
  server: Server;
  baseUrl: string;
  requests: RecordedRequest[];
  setHandler: (
    handler: (req: RecordedRequest) => {
      status: number;
      body: unknown;
    } | null,
  ) => void;
}

function startFixture(): Promise<FixtureServer> {
  return new Promise((resolve) => {
    const requests: RecordedRequest[] = [];
    let handler: (req: RecordedRequest) => { status: number; body: unknown } | null
      = () => ({ status: 404, body: { error: "no handler" } });
    const server = createServer((req, res) => {
      const chunks: Buffer[] = [];
      req.on("data", (chunk) => chunks.push(chunk as Buffer));
      req.on("end", () => {
        const recorded: RecordedRequest = {
          method: req.method ?? "GET",
          url: req.url ?? "/",
          headers: Object.fromEntries(
            Object.entries(req.headers).map(([k, v]) => [
              k.toLowerCase(),
              Array.isArray(v) ? v.join(",") : (v ?? ""),
            ]),
          ),
          body: Buffer.concat(chunks).toString("utf8"),
        };
        requests.push(recorded);
        const result = handler(recorded);
        if (!result) {
          res.statusCode = 404;
          res.end();
          return;
        }
        res.statusCode = result.status;
        res.setHeader("content-type", "application/json");
        res.end(JSON.stringify(result.body));
      });
    });
    server.listen(0, "127.0.0.1", () => {
      const addr = server.address() as AddressInfo;
      resolve({
        server,
        baseUrl: `http://127.0.0.1:${addr.port}`,
        requests,
        setHandler: (h) => {
          handler = h;
        },
      });
    });
  });
}

function stopFixture(fixture: FixtureServer): Promise<void> {
  return new Promise((resolve) => {
    fixture.server.close(() => resolve());
  });
}

function makeCtx(baseUrl: string, idempotencyKey?: string): BrokerCallContext {
  return {
    companyId: "c1",
    hostAgentId: "a1",
    hostAdapterType: "test_adapter",
    hostAdapterConfig: { url: baseUrl, apiKey: "k1" },
    idempotencyKey,
  };
}

describe("createHttpAgentRuntimeBroker", () => {
  let fixture: FixtureServer;

  beforeEach(async () => {
    fixture = await startFixture();
  });
  afterEach(async () => {
    await stopFixture(fixture);
  });

  function buildBroker() {
    return createHttpAgentRuntimeBroker({
      hostKind: "test_adapter",
      resolveBaseUrl: (config) =>
        typeof config.url === "string" ? (config.url as string) : null,
      headersFromConfig: (config) => {
        const apiKey = typeof config.apiKey === "string" ? config.apiKey : "";
        return apiKey ? { authorization: `Bearer ${apiKey}` } : ({} as Record<string, string>);
      },
      requestTimeoutMs: 2_000,
    });
  }

  it("describeBroker returns reachable=true and surfaces capabilities from the catalog", async () => {
    fixture.setHandler((req) => {
      if (req.method === "GET" && req.url === "/v2/runtime/catalog") {
        return {
          status: 200,
          body: {
            hostKind: "test_adapter",
            hostVersion: "1.2.3",
            kinds: [
              {
                kind: "agent_bundle",
                provisionable: true,
                plans: [
                  { id: "skills_only", label: "Skills only" },
                ],
                supportedContents: ["skill", "prompt"],
              },
            ],
            capabilities: {
              supportsAsync: true,
              supportsBundleProvisioning: true,
              supportsAgentProvisioning: false,
              supportsConfigProfile: true,
              supportsMcpServer: true,
              supportsSecretBundle: true,
              supportsBindings: true,
              requiresApproval: false,
            },
          },
        };
      }
      return null;
    });

    const broker = buildBroker();
    const desc = await broker.describeBroker(makeCtx(fixture.baseUrl));
    expect(desc.reachable).toBe(true);
    expect(desc.hostKind).toBe("test_adapter");
    expect(desc.capabilities.supportsBundleProvisioning).toBe(true);
    expect(desc.catalog?.kinds[0]?.kind).toBe("agent_bundle");
    // Auth header was forwarded:
    expect(fixture.requests[0]?.headers.authorization).toBe("Bearer k1");
  });

  it("describeBroker degrades to reachable=false on 404 (method not implemented)", async () => {
    fixture.setHandler(() => ({ status: 404, body: { error: "not found" } }));
    const broker = buildBroker();
    const desc = await broker.describeBroker(makeCtx(fixture.baseUrl));
    expect(desc.reachable).toBe(false);
    expect(desc.catalog).toBeNull();
    expect(desc.capabilities.supportsBundleProvisioning).toBe(false);
    expect(desc.reason).toMatch(/OSBAPI runtime endpoints/i);
  });

  it("describeBroker degrades to reachable=false when adapter config has no url", async () => {
    const broker = buildBroker();
    const desc = await broker.describeBroker({
      companyId: "c1",
      hostAgentId: "a1",
      hostAdapterType: "test_adapter",
      hostAdapterConfig: {},
    });
    expect(desc.reachable).toBe(false);
    expect(desc.reason).toMatch(/url/i);
  });

  it("putInstance forwards body, idempotency key, and parses operation+state", async () => {
    fixture.setHandler((req) => {
      if (req.method === "PUT" && req.url === "/v2/runtime/instances/inst-1") {
        const body = JSON.parse(req.body || "{}");
        return {
          status: 200,
          body: {
            operation: {
              id: "op-1",
              state: "succeeded",
              description: `provisioned ${body.kind}`,
            },
            state: {
              instanceId: "inst-1",
              kind: body.kind,
              actualStatus: "ready",
              observedAt: "2026-05-01T00:00:00.000Z",
            },
          },
        };
      }
      return null;
    });

    const broker = buildBroker();
    const result = await broker.putInstance(
      makeCtx(fixture.baseUrl, "idem-42"),
      {
        instanceId: "inst-1",
        kind: "agent_bundle",
        plan: "skills_only",
        desiredConfig: { skills: ["pdf"] },
        secretRefs: [{ key: "anthropicApiKey", ref: "secret://abc" }],
      },
    );

    expect(result.operation.state).toBe("succeeded");
    expect(result.state?.actualStatus).toBe("ready");
    const recorded = fixture.requests[0];
    expect(recorded?.headers["x-idempotency-key"]).toBe("idem-42");
    const sent = JSON.parse(recorded?.body ?? "{}");
    expect(sent.kind).toBe("agent_bundle");
    expect(sent.plan).toBe("skills_only");
    expect(sent.desiredConfig).toEqual({ skills: ["pdf"] });
    expect(sent.secretRefs).toEqual([
      { key: "anthropicApiKey", ref: "secret://abc" },
    ]);
  });

  it("deleteInstance returns operation result", async () => {
    fixture.setHandler((req) => {
      if (req.method === "DELETE") {
        return {
          status: 200,
          body: { operation: { id: "op-2", state: "succeeded" } },
        };
      }
      return null;
    });
    const broker = buildBroker();
    const res = await broker.deleteInstance(makeCtx(fixture.baseUrl), {
      instanceId: "inst-1",
      kind: "agent_bundle",
    });
    expect(res.operation.state).toBe("succeeded");
    expect(fixture.requests[0]?.url).toBe("/v2/runtime/instances/inst-1");
  });

  it("getOperation polls the operation endpoint", async () => {
    fixture.setHandler((req) => {
      if (req.method === "GET" && req.url === "/v2/runtime/operations/op-9") {
        return {
          status: 200,
          body: {
            operation: {
              id: "op-9",
              state: "in_progress",
              pollAfterMs: 500,
            },
          },
        };
      }
      return null;
    });
    const broker = buildBroker();
    const op = await broker.getOperation(makeCtx(fixture.baseUrl), "op-9");
    expect(op.state).toBe("in_progress");
    expect(op.pollAfterMs).toBe(500);
  });

  it("listInstances returns parsed entries", async () => {
    fixture.setHandler((req) => {
      if (req.method === "GET" && req.url?.startsWith("/v2/runtime/instances")) {
        return {
          status: 200,
          body: {
            instances: [
              {
                instanceId: "inst-a",
                kind: "agent_bundle",
                actualStatus: "ready",
              },
              {
                instanceId: "inst-b",
                kind: "agent_bundle",
                actualStatus: "pending",
              },
              { kind: "garbage" }, // missing instanceId — must be filtered
            ],
          },
        };
      }
      return null;
    });
    const broker = buildBroker();
    const list = await broker.listInstances(makeCtx(fixture.baseUrl));
    expect(list.length).toBe(2);
    expect(list[0]?.instanceId).toBe("inst-a");
    expect(list[1]?.actualStatus).toBe("pending");
  });
});
