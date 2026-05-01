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
} from "@paperclipai/adapter-utils";
import { isAgentBundleContentKind } from "@paperclipai/adapter-utils";
import { parseObject } from "@paperclipai/adapter-utils/server-utils";
import {
  asRecord,
  headerMapHasIgnoreCase,
  nonEmpty,
  normalizeScopes,
  resolveAuthToken,
  resolveDisableDeviceAuth,
  toAuthorizationHeaderValue,
  toStringRecord,
} from "../shared/config.js";
import {
  GatewayWsClient,
  OPENCLAW_GATEWAY_DEFAULT_CLIENT_ID,
  OPENCLAW_GATEWAY_DEFAULT_CLIENT_MODE,
  OPENCLAW_GATEWAY_DEFAULT_CLIENT_VERSION,
  OPENCLAW_GATEWAY_DEFAULT_ROLE,
  OPENCLAW_GATEWAY_PROTOCOL_VERSION,
  buildDeviceAuthPayloadV3,
  resolveDeviceIdentity,
  signDevicePayload,
  type GatewayResponseError,
} from "./execute.js";

const HOST_KIND = "openclaw_gateway";
const DEFAULT_CONNECT_TIMEOUT_MS = 10_000;
const DEFAULT_REQUEST_TIMEOUT_MS = 15_000;

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

function isMethodNotFound(err: unknown): boolean {
  if (!err || !(err instanceof Error)) return false;
  const code = (err as GatewayResponseError).gatewayCode;
  if (typeof code === "string") {
    const c = code.toLowerCase();
    if (
      c === "method.not_found"
      || c === "method_not_found"
      || c === "unknown_method"
      || c === "unsupported_method"
      || c === "not_implemented"
    ) {
      return true;
    }
  }
  return /unknown method|unsupported method|not implemented|no such method/i.test(
    err.message,
  );
}

function normalizeUrl(input: string): URL | null {
  try {
    return new URL(input);
  } catch {
    return null;
  }
}

function buildConnectClient(
  hostAdapterConfig: Record<string, unknown>,
  onLog: (level: "info" | "warn" | "error", msg: string) => void,
): {
  url: string;
  client: GatewayWsClient;
  connect: () => Promise<void>;
  connectTimeoutMs: number;
  requestTimeoutMs: number;
} {
  const parsedConfig = parseObject(hostAdapterConfig);
  const urlValue = nonEmpty(parsedConfig.url);
  if (!urlValue) {
    throw new Error("openclaw_gateway: missing 'url' in adapter config");
  }
  const parsedUrl = normalizeUrl(urlValue);
  if (!parsedUrl) {
    throw new Error(`openclaw_gateway: invalid url '${urlValue}'`);
  }
  if (parsedUrl.protocol !== "ws:" && parsedUrl.protocol !== "wss:") {
    throw new Error(
      `openclaw_gateway: unsupported url protocol '${parsedUrl.protocol}'`,
    );
  }

  const connectTimeoutMs = DEFAULT_CONNECT_TIMEOUT_MS;
  const requestTimeoutMs = DEFAULT_REQUEST_TIMEOUT_MS;

  const headers = toStringRecord(parsedConfig.headers);
  const authToken = resolveAuthToken(parsedConfig, headers);
  const password = nonEmpty(parsedConfig.password);
  const deviceToken = nonEmpty(parsedConfig.deviceToken);
  if (authToken && !headerMapHasIgnoreCase(headers, "authorization")) {
    headers.authorization = toAuthorizationHeaderValue(authToken);
  }

  const clientId = nonEmpty(parsedConfig.clientId) ?? OPENCLAW_GATEWAY_DEFAULT_CLIENT_ID;
  const clientMode = nonEmpty(parsedConfig.clientMode) ?? OPENCLAW_GATEWAY_DEFAULT_CLIENT_MODE;
  const clientVersion = nonEmpty(parsedConfig.clientVersion) ?? OPENCLAW_GATEWAY_DEFAULT_CLIENT_VERSION;
  const role = nonEmpty(parsedConfig.role) ?? OPENCLAW_GATEWAY_DEFAULT_ROLE;
  const scopes = normalizeScopes(parsedConfig.scopes);
  const deviceFamily = nonEmpty(parsedConfig.deviceFamily);
  const disableDeviceAuth = resolveDisableDeviceAuth(parsedConfig);

  const client = new GatewayWsClient({
    url: parsedUrl.toString(),
    headers,
    onEvent: () => {},
    onLog: async (level, message) => {
      onLog(level === "stderr" ? "warn" : "info", message);
    },
  });

  const deviceIdentity = disableDeviceAuth ? null : resolveDeviceIdentity(parsedConfig);

  const connect = async () => {
    await client.connect((nonce) => {
      const signedAtMs = Date.now();
      const connectParams: Record<string, unknown> = {
        minProtocol: OPENCLAW_GATEWAY_PROTOCOL_VERSION,
        maxProtocol: OPENCLAW_GATEWAY_PROTOCOL_VERSION,
        client: {
          id: clientId,
          version: clientVersion,
          platform: process.platform,
          ...(deviceFamily ? { deviceFamily } : {}),
          mode: clientMode,
        },
        role,
        scopes,
        auth:
          authToken || password || deviceToken
            ? {
                ...(authToken ? { token: authToken } : {}),
                ...(deviceToken ? { deviceToken } : {}),
                ...(password ? { password } : {}),
              }
            : undefined,
      };
      if (deviceIdentity) {
        const payload = buildDeviceAuthPayloadV3({
          deviceId: deviceIdentity.deviceId,
          clientId,
          clientMode,
          role,
          scopes,
          signedAtMs,
          token: authToken,
          nonce,
          platform: process.platform,
          deviceFamily,
        });
        connectParams.device = {
          id: deviceIdentity.deviceId,
          publicKey: deviceIdentity.publicKeyRawBase64Url,
          signature: signDevicePayload(deviceIdentity.privateKeyPem, payload),
          signedAt: signedAtMs,
          nonce,
        };
      }
      return connectParams;
    }, connectTimeoutMs);
  };

  return {
    url: parsedUrl.toString(),
    client,
    connect,
    connectTimeoutMs,
    requestTimeoutMs,
  };
}

async function callMethod<T>(
  ctx: BrokerCallContext,
  method: string,
  params: unknown,
): Promise<T> {
  const log = ctx.onLog ?? (() => {});
  const { client, connect, requestTimeoutMs } = buildConnectClient(
    ctx.hostAdapterConfig,
    log,
  );
  try {
    await connect();
    return await client.request<T>(method, params, { timeoutMs: requestTimeoutMs });
  } finally {
    client.close();
  }
}

function parseCapabilities(
  raw: unknown,
): AgentRuntimeCatalogCapabilities {
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

function parseCatalog(raw: unknown): AgentRuntimeCatalog {
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
            description: typeof p.description === "string" ? p.description : null,
            configSchema:
              p.configSchema && typeof p.configSchema === "object"
                ? (p.configSchema as Record<string, unknown>)
                : null,
            meta:
              p.meta && typeof p.meta === "object"
                ? (p.meta as Record<string, unknown>)
                : null,
          })),
        supportedContents: Array.isArray(entry.supportedContents)
          ? entry.supportedContents.filter(isAgentBundleContentKind)
          : undefined,
      };
    })
    .filter((entry) => Boolean(entry.kind));

  return {
    hostKind: HOST_KIND,
    hostVersion: typeof record.hostVersion === "string" ? record.hostVersion : null,
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
    status === "ready" || status === "pending" || status === "failed" || status === "absent"
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
            const ckSafe: import("@paperclipai/adapter-utils").AgentBundleContentKind =
              isAgentBundleContentKind(ck) ? ck : "skill";
            const cs = nonEmpty(c.state);
            const csSafe: "pending" | "installed" | "failed" | "removed" =
              cs === "pending" || cs === "installed" || cs === "failed" || cs === "removed"
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
    observedAt: typeof r.observedAt === "string" ? r.observedAt : new Date().toISOString(),
  };
}

function parseOperation(raw: unknown): BrokerOperation {
  const r = asRecord(raw) ?? {};
  const state = nonEmpty(r.state);
  const stateSafe =
    state === "in_progress" || state === "succeeded" || state === "failed"
      ? state
      : "succeeded";
  const errRaw = asRecord(r.error);
  return {
    id: nonEmpty(r.id) ?? "",
    state: stateSafe,
    description: typeof r.description === "string" ? r.description : null,
    pollAfterMs: typeof r.pollAfterMs === "number" ? r.pollAfterMs : null,
    result:
      r.result && typeof r.result === "object"
        ? (r.result as Record<string, unknown>)
        : null,
    error: errRaw
      ? {
          code: typeof errRaw.code === "string" ? errRaw.code : null,
          message: nonEmpty(errRaw.message) ?? "operation failed",
        }
      : null,
  };
}

export const openclawGatewayBroker: AgentRuntimeBroker = {
  async describeBroker(ctx: BrokerCallContext): Promise<AgentRuntimeBrokerDescriptor> {
    try {
      const catalog = await this.getCatalog(ctx);
      return {
        hostKind: HOST_KIND,
        reachable: true,
        capabilities: catalog.capabilities,
        catalog,
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const reason = isMethodNotFound(err)
        ? "remote OpenClaw does not implement req runtime.* methods"
        : message;
      return {
        hostKind: HOST_KIND,
        reachable: false,
        capabilities: { ...FALLBACK_CAPABILITIES },
        catalog: null,
        reason,
      };
    }
  },

  async getCatalog(ctx: BrokerCallContext): Promise<AgentRuntimeCatalog> {
    const raw = await callMethod<Record<string, unknown>>(ctx, "runtime.catalog", {});
    return parseCatalog(raw);
  },

  async listInstances(
    ctx: BrokerCallContext,
    opts?: { kind?: AgentRuntimeKind },
  ): Promise<RuntimeInstanceState[]> {
    const params: Record<string, unknown> = {};
    if (opts?.kind) params.kind = opts.kind;
    const raw = await callMethod<Record<string, unknown>>(ctx, "runtime.instance.list", params);
    const list = Array.isArray(raw?.instances) ? raw.instances : [];
    return list
      .map((entry) => parseInstanceState(entry))
      .filter((entry): entry is RuntimeInstanceState => Boolean(entry));
  },

  async putInstance(
    ctx: BrokerCallContext,
    input: ProvisionInstanceInput,
  ): Promise<ProvisionInstanceResult> {
    const params = {
      instanceId: input.instanceId,
      kind: input.kind,
      plan: input.plan,
      desiredConfig: input.desiredConfig,
      ...(input.secretRefs && input.secretRefs.length > 0
        ? { secretRefs: input.secretRefs }
        : {}),
      idempotencyKey: ctx.idempotencyKey ?? input.instanceId,
    };
    const raw = await callMethod<Record<string, unknown>>(ctx, "runtime.instance.put", params);
    return {
      operation: parseOperation(raw?.operation ?? raw),
      state: parseInstanceState(raw?.state ?? null),
    };
  },

  async deleteInstance(
    ctx: BrokerCallContext,
    input: { instanceId: string; kind: AgentRuntimeKind },
  ): Promise<ProvisionInstanceResult> {
    const raw = await callMethod<Record<string, unknown>>(ctx, "runtime.instance.delete", {
      instanceId: input.instanceId,
      kind: input.kind,
      idempotencyKey: ctx.idempotencyKey ?? input.instanceId,
    });
    return {
      operation: parseOperation(raw?.operation ?? raw),
      state: parseInstanceState(raw?.state ?? null),
    };
  },

  async getOperation(ctx: BrokerCallContext, opId: string): Promise<BrokerOperation> {
    const raw = await callMethod<Record<string, unknown>>(ctx, "runtime.operation.get", {
      operationId: opId,
    });
    return parseOperation(raw?.operation ?? raw);
  },
};
