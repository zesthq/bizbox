import type {
  AgentRuntimeBroker,
  AgentRuntimeBrokerDescriptor,
  AgentRuntimeCatalog,
  AgentRuntimeCatalogCapabilities,
  AgentRuntimeKind,
  BrokerCallContext,
  BrokerOperation,
  ProvisionInstanceInput,
  ProvisionInstanceResult,
  RuntimeInstanceState,
} from "./types.js";
import { isAgentBundleContentKind } from "./types.js";

/**
 * Generic OSBAPI-shaped HTTP transport for the Agent Runtime Broker.
 *
 * Cloud adapters that expose an HTTP control surface (REST) plug their host
 * into Bizbox's reconciler by wrapping it with this factory. The wire format
 * is intentionally aligned with the planned OSBAPI v2 shape so a future
 * server-side implementation can speak directly without bespoke glue:
 *
 *   GET    {baseUrl}/v2/runtime/catalog
 *   GET    {baseUrl}/v2/runtime/instances
 *   GET    {baseUrl}/v2/runtime/instances/:id
 *   PUT    {baseUrl}/v2/runtime/instances/:id        body: ProvisionInstanceInput
 *   DELETE {baseUrl}/v2/runtime/instances/:id
 *   GET    {baseUrl}/v2/runtime/operations/:id
 *
 * `describeBroker` performs `getCatalog`; if the remote returns 404/501 or a
 * connection error, we degrade to `reachable=false` with all capabilities
 * disabled — the same fallback shape the OpenClaw broker uses.
 *
 * The `headersFromConfig` callback is invoked per call with the resolved
 * adapter config (secrets already materialized) so adapters can build
 * `Authorization`, custom auth headers, etc. without leaking secrets back to
 * the broker abstraction.
 */
export interface HttpAgentRuntimeBrokerOptions {
  /** Stable identifier used in descriptor.hostKind (e.g. "otto_agent"). */
  hostKind: string;
  /**
   * Resolves the base URL from per-call adapter config. Return `null` when
   * config doesn't carry a usable URL — describe will then return
   * reachable=false with a clear reason.
   */
  resolveBaseUrl: (config: Record<string, unknown>) => string | null;
  /**
   * Build the request headers for one call. Receives the resolved adapter
   * config (with secrets already materialized).
   */
  headersFromConfig?: (
    config: Record<string, unknown>,
  ) => Record<string, string>;
  /** Override the default fetch — primarily for tests. */
  fetchImpl?: typeof fetch;
  /** Per-request timeout. Default: 15s. */
  requestTimeoutMs?: number;
  /**
   * Override the URL prefix below baseUrl. Default: "/v2/runtime". A
   * downstream adapter that exposes the routes under a different prefix can
   * supply its own (e.g. "/api/runtime").
   */
  pathPrefix?: string;
}

const DEFAULT_TIMEOUT_MS = 15_000;
const DEFAULT_PREFIX = "/v2/runtime";

const FALLBACK_CAPABILITIES: AgentRuntimeCatalogCapabilities = {
  supportsAsync: false,
  supportsBindings: false,
  supportsAgentProvisioning: false,
  supportsBundleProvisioning: false,
  supportsConfigProfile: false,
  supportsMcpServer: false,
  supportsSecretBundle: false,
  requiresApproval: false,
};

class HttpBrokerError extends Error {
  status: number;
  body: unknown;
  constructor(status: number, message: string, body: unknown) {
    super(message);
    this.name = "HttpBrokerError";
    this.status = status;
    this.body = body;
  }
}

function isNotImplemented(err: unknown): boolean {
  if (err instanceof HttpBrokerError) {
    return err.status === 404 || err.status === 501;
  }
  return false;
}

function asRecord(v: unknown): Record<string, unknown> | null {
  return v && typeof v === "object" && !Array.isArray(v)
    ? (v as Record<string, unknown>)
    : null;
}

function nonEmpty(v: unknown): string | null {
  return typeof v === "string" && v.length > 0 ? v : null;
}

function parseCapabilities(raw: unknown): AgentRuntimeCatalogCapabilities {
  const r = asRecord(raw) ?? {};
  return {
    supportsAsync: r.supportsAsync === true,
    supportsBindings: r.supportsBindings === true,
    supportsAgentProvisioning: r.supportsAgentProvisioning === true,
    supportsBundleProvisioning: r.supportsBundleProvisioning === true,
    supportsConfigProfile: r.supportsConfigProfile === true,
    supportsMcpServer: r.supportsMcpServer === true,
    supportsSecretBundle: r.supportsSecretBundle === true,
    requiresApproval: r.requiresApproval === true,
  };
}

function parseCatalog(hostKind: string, raw: unknown): AgentRuntimeCatalog {
  const record = asRecord(raw) ?? {};
  const kindsArray = Array.isArray(record.kinds) ? record.kinds : [];
  const kinds = kindsArray
    .map((entry) => asRecord(entry))
    .filter((entry): entry is Record<string, unknown> => Boolean(entry))
    .map((entry) => {
      const plansArray = Array.isArray(entry.plans) ? entry.plans : [];
      return {
        kind: nonEmpty(entry.kind) as AgentRuntimeKind,
        provisionable: entry.provisionable === true,
        plans: plansArray
          .map((p) => asRecord(p))
          .filter((p): p is Record<string, unknown> => Boolean(p))
          .map((p) => ({
            id: nonEmpty(p.id) ?? "default",
            label: nonEmpty(p.label) ?? nonEmpty(p.id) ?? "default",
            description:
              typeof p.description === "string" ? p.description : null,
            configSchema: asRecord(p.configSchema),
            meta: asRecord(p.meta),
          })),
        supportedContents: Array.isArray(entry.supportedContents)
          ? (entry.supportedContents.filter(isAgentBundleContentKind) as Array<
              "skill" | "prompt" | "mcp_ref" | "model_default" | "subagent_profile"
            >)
          : undefined,
      };
    })
    .filter((entry) => Boolean(entry.kind));

  return {
    hostKind: nonEmpty(record.hostKind) ?? hostKind,
    hostVersion:
      typeof record.hostVersion === "string" ? record.hostVersion : null,
    kinds,
    capabilities: parseCapabilities(record.capabilities),
    fetchedAt: new Date().toISOString(),
  };
}

function parseInstanceState(raw: unknown): RuntimeInstanceState | null {
  const r = asRecord(raw);
  if (!r) return null;
  const instanceId = nonEmpty(r.instanceId) ?? nonEmpty(r.id);
  const kind = nonEmpty(r.kind);
  if (!instanceId || !kind) return null;
  const status = nonEmpty(r.actualStatus) ?? nonEmpty(r.status);
  const actualStatus =
    status === "ready"
    || status === "pending"
    || status === "failed"
    || status === "absent"
      ? status
      : "pending";
  return {
    instanceId,
    kind: kind as AgentRuntimeKind,
    plan: typeof r.plan === "string" ? r.plan : null,
    actualStatus,
    contents: Array.isArray(r.contents)
      ? r.contents
          .map((c) => asRecord(c))
          .filter((c): c is Record<string, unknown> => Boolean(c))
          .map((c) => {
            const ck = nonEmpty(c.kind);
            const ckSafe:
              | "skill"
              | "prompt"
              | "mcp_ref"
              | "model_default"
              | "subagent_profile" = isAgentBundleContentKind(ck) ? ck : "skill";
            const cs = nonEmpty(c.state);
            const csSafe: "pending" | "installed" | "failed" | "removed" =
              cs === "pending"
              || cs === "installed"
              || cs === "failed"
              || cs === "removed"
                ? cs
                : "pending";
            return {
              kind: ckSafe,
              key: nonEmpty(c.key) ?? "",
              state: csSafe,
              detail: typeof c.detail === "string" ? c.detail : null,
            };
          })
          .filter((c) => c.key.length > 0)
      : null,
    detail: typeof r.detail === "string" ? r.detail : null,
    observedAt:
      typeof r.observedAt === "string" ? r.observedAt : new Date().toISOString(),
  };
}

function parseOperation(raw: unknown): BrokerOperation {
  const r = asRecord(raw) ?? {};
  const state = nonEmpty(r.state);
  const stateSafe: "in_progress" | "succeeded" | "failed" =
    state === "in_progress" || state === "succeeded" || state === "failed"
      ? state
      : "succeeded";
  const errRaw = asRecord(r.error);
  return {
    id: nonEmpty(r.id) ?? "",
    state: stateSafe,
    description: typeof r.description === "string" ? r.description : null,
    pollAfterMs: typeof r.pollAfterMs === "number" ? r.pollAfterMs : null,
    result: asRecord(r.result),
    error: errRaw
      ? {
          code: typeof errRaw.code === "string" ? errRaw.code : null,
          message: nonEmpty(errRaw.message) ?? "operation failed",
        }
      : null,
  };
}

export function createHttpAgentRuntimeBroker(
  options: HttpAgentRuntimeBrokerOptions,
): AgentRuntimeBroker {
  const fetchImpl = options.fetchImpl ?? fetch;
  const timeoutMs = options.requestTimeoutMs ?? DEFAULT_TIMEOUT_MS;
  const prefix = options.pathPrefix ?? DEFAULT_PREFIX;

  function joinUrl(baseUrl: string, suffix: string): string {
    const trimmed = baseUrl.endsWith("/") ? baseUrl.slice(0, -1) : baseUrl;
    return `${trimmed}${prefix}${suffix}`;
  }

  async function call<T = unknown>(
    ctx: BrokerCallContext,
    method: "GET" | "POST" | "PUT" | "DELETE",
    suffix: string,
    body?: unknown,
  ): Promise<T> {
    const baseUrl = options.resolveBaseUrl(ctx.hostAdapterConfig);
    if (!baseUrl) {
      throw new Error(`${options.hostKind}: missing 'url' in adapter config`);
    }

    const headers: Record<string, string> = {
      accept: "application/json",
      ...(options.headersFromConfig?.(ctx.hostAdapterConfig) ?? {}),
    };
    if (body !== undefined) {
      headers["content-type"] = "application/json";
    }
    if (ctx.idempotencyKey) {
      headers["x-idempotency-key"] = ctx.idempotencyKey;
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetchImpl(joinUrl(baseUrl, suffix), {
        method,
        headers,
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: controller.signal,
      });
      const text = await response.text();
      const parsed = (() => {
        if (!text) return null;
        try {
          return JSON.parse(text);
        } catch {
          return text;
        }
      })();
      if (!response.ok) {
        throw new HttpBrokerError(
          response.status,
          `${method} ${suffix} failed: ${response.status} ${response.statusText}`,
          parsed,
        );
      }
      return parsed as T;
    } finally {
      clearTimeout(timer);
    }
  }

  return {
    async describeBroker(
      ctx: BrokerCallContext,
    ): Promise<AgentRuntimeBrokerDescriptor> {
      try {
        const catalog = await this.getCatalog(ctx);
        return {
          hostKind: options.hostKind,
          reachable: true,
          capabilities: catalog.capabilities,
          catalog,
        };
      } catch (err) {
        const reason = isNotImplemented(err)
          ? `remote ${options.hostKind} does not implement OSBAPI runtime endpoints`
          : err instanceof Error
            ? err.message
            : String(err);
        return {
          hostKind: options.hostKind,
          reachable: false,
          capabilities: { ...FALLBACK_CAPABILITIES },
          catalog: null,
          reason,
        };
      }
    },

    async getCatalog(ctx: BrokerCallContext): Promise<AgentRuntimeCatalog> {
      const raw = await call(ctx, "GET", "/catalog");
      return parseCatalog(options.hostKind, raw);
    },

    async listInstances(
      ctx: BrokerCallContext,
      opts?: { kind?: AgentRuntimeKind },
    ): Promise<RuntimeInstanceState[]> {
      const qs = opts?.kind
        ? `?kind=${encodeURIComponent(opts.kind)}`
        : "";
      const raw = await call<Record<string, unknown> | null>(
        ctx,
        "GET",
        `/instances${qs}`,
      );
      const list = Array.isArray(raw?.instances) ? raw.instances : [];
      return list
        .map((entry) => parseInstanceState(entry))
        .filter((entry): entry is RuntimeInstanceState => Boolean(entry));
    },

    async putInstance(
      ctx: BrokerCallContext,
      input: ProvisionInstanceInput,
    ): Promise<ProvisionInstanceResult> {
      const body = {
        kind: input.kind,
        plan: input.plan,
        desiredConfig: input.desiredConfig,
        ...(input.secretRefs && input.secretRefs.length > 0
          ? { secretRefs: input.secretRefs }
          : {}),
      };
      const raw = await call<Record<string, unknown> | null>(
        ctx,
        "PUT",
        `/instances/${encodeURIComponent(input.instanceId)}`,
        body,
      );
      return {
        operation: parseOperation(raw?.operation ?? raw),
        state: parseInstanceState(raw?.state ?? null),
      };
    },

    async deleteInstance(
      ctx: BrokerCallContext,
      input: { instanceId: string; kind: AgentRuntimeKind },
    ): Promise<ProvisionInstanceResult> {
      const raw = await call<Record<string, unknown> | null>(
        ctx,
        "DELETE",
        `/instances/${encodeURIComponent(input.instanceId)}`,
      );
      return {
        operation: parseOperation(raw?.operation ?? raw),
        state: parseInstanceState(raw?.state ?? null),
      };
    },

    async getOperation(
      ctx: BrokerCallContext,
      opId: string,
    ): Promise<BrokerOperation> {
      const raw = await call<Record<string, unknown> | null>(
        ctx,
        "GET",
        `/operations/${encodeURIComponent(opId)}`,
      );
      return parseOperation(raw?.operation ?? raw);
    },
  };
}
