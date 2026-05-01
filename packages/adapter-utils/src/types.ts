// ---------------------------------------------------------------------------
// Minimal adapter-facing interfaces (no drizzle dependency)
// ---------------------------------------------------------------------------

export interface AdapterAgent {
  id: string;
  companyId: string;
  name: string;
  adapterType: string | null;
  adapterConfig: unknown;
}

export interface AdapterRuntime {
  /**
   * Legacy single session id view. Prefer `sessionParams` + `sessionDisplayId`.
   */
  sessionId: string | null;
  sessionParams: Record<string, unknown> | null;
  sessionDisplayId: string | null;
  taskKey: string | null;
}

// ---------------------------------------------------------------------------
// Execution types (moved from server/src/adapters/types.ts)
// ---------------------------------------------------------------------------

export interface UsageSummary {
  inputTokens: number;
  outputTokens: number;
  cachedInputTokens?: number;
}

export type AdapterBillingType =
  | "api"
  | "subscription"
  | "metered_api"
  | "subscription_included"
  | "subscription_overage"
  | "credits"
  | "fixed"
  | "unknown";

export interface AdapterRuntimeServiceReport {
  id?: string | null;
  projectId?: string | null;
  projectWorkspaceId?: string | null;
  issueId?: string | null;
  scopeType?: "project_workspace" | "execution_workspace" | "run" | "agent";
  scopeId?: string | null;
  serviceName: string;
  status?: "starting" | "running" | "stopped" | "failed";
  lifecycle?: "shared" | "ephemeral";
  reuseKey?: string | null;
  command?: string | null;
  cwd?: string | null;
  port?: number | null;
  url?: string | null;
  providerRef?: string | null;
  ownerAgentId?: string | null;
  stopPolicy?: Record<string, unknown> | null;
  healthStatus?: "unknown" | "healthy" | "unhealthy";
}

export interface AdapterExecutionResult {
  exitCode: number | null;
  signal: string | null;
  timedOut: boolean;
  errorMessage?: string | null;
  errorCode?: string | null;
  errorMeta?: Record<string, unknown>;
  usage?: UsageSummary;
  /**
   * Legacy single session id output. Prefer `sessionParams` + `sessionDisplayId`.
   */
  sessionId?: string | null;
  sessionParams?: Record<string, unknown> | null;
  sessionDisplayId?: string | null;
  provider?: string | null;
  biller?: string | null;
  model?: string | null;
  billingType?: AdapterBillingType | null;
  costUsd?: number | null;
  resultJson?: Record<string, unknown> | null;
  runtimeServices?: AdapterRuntimeServiceReport[];
  summary?: string | null;
  clearSession?: boolean;
  question?: {
    prompt: string;
    choices: Array<{
      key: string;
      label: string;
      description?: string;
    }>;
  } | null;
}

export interface AdapterSessionCodec {
  deserialize(raw: unknown): Record<string, unknown> | null;
  serialize(params: Record<string, unknown> | null): Record<string, unknown> | null;
  getDisplayId?: (params: Record<string, unknown> | null) => string | null;
}

export interface AdapterInvocationMeta {
  adapterType: string;
  command: string;
  cwd?: string;
  commandArgs?: string[];
  commandNotes?: string[];
  env?: Record<string, string>;
  prompt?: string;
  promptMetrics?: Record<string, number>;
  context?: Record<string, unknown>;
}

export interface AdapterExecutionContext {
  runId: string;
  agent: AdapterAgent;
  runtime: AdapterRuntime;
  config: Record<string, unknown>;
  context: Record<string, unknown>;
  onLog: (stream: "stdout" | "stderr", chunk: string) => Promise<void>;
  onMeta?: (meta: AdapterInvocationMeta) => Promise<void>;
  onSpawn?: (meta: { pid: number; processGroupId: number | null; startedAt: string }) => Promise<void>;
  authToken?: string;
}

export interface AdapterModel {
  id: string;
  label: string;
}

export type AdapterEnvironmentCheckLevel = "info" | "warn" | "error";

export interface AdapterEnvironmentCheck {
  code: string;
  level: AdapterEnvironmentCheckLevel;
  message: string;
  detail?: string | null;
  hint?: string | null;
}

export type AdapterEnvironmentTestStatus = "pass" | "warn" | "fail";

export interface AdapterEnvironmentTestResult {
  adapterType: string;
  status: AdapterEnvironmentTestStatus;
  checks: AdapterEnvironmentCheck[];
  testedAt: string;
}

export type AdapterSkillSyncMode = "unsupported" | "persistent" | "ephemeral";

export type AdapterSkillState =
  | "available"
  | "configured"
  | "installed"
  | "missing"
  | "stale"
  | "external";

export type AdapterSkillOrigin =
  | "company_managed"
  | "paperclip_required"
  | "user_installed"
  | "external_unknown";

export interface AdapterSkillEntry {
  key: string;
  runtimeName: string | null;
  desired: boolean;
  managed: boolean;
  required?: boolean;
  requiredReason?: string | null;
  state: AdapterSkillState;
  origin?: AdapterSkillOrigin;
  originLabel?: string | null;
  locationLabel?: string | null;
  readOnly?: boolean;
  sourcePath?: string | null;
  targetPath?: string | null;
  detail?: string | null;
}

export interface AdapterSkillSnapshot {
  adapterType: string;
  supported: boolean;
  mode: AdapterSkillSyncMode;
  desiredSkills: string[];
  entries: AdapterSkillEntry[];
  warnings: string[];
}

export interface AdapterSkillContext {
  agentId: string;
  companyId: string;
  adapterType: string;
  config: Record<string, unknown>;
}

export interface AdapterEnvironmentTestContext {
  companyId: string;
  adapterType: string;
  config: Record<string, unknown>;
  deployment?: {
    mode?: "local_trusted" | "authenticated";
    exposure?: "private" | "public";
    bindHost?: string | null;
    allowedHostnames?: string[];
  };
}

/** Payload for the onHireApproved adapter lifecycle hook (e.g. join-request or hire_agent approval). */
export interface HireApprovedPayload {
  companyId: string;
  agentId: string;
  agentName: string;
  adapterType: string;
  /** "join_request" | "approval" */
  source: "join_request" | "approval";
  sourceId: string;
  approvedAt: string;
  /** Canonical operator-facing message for cloud adapters to show the user. */
  message: string;
}

/** Result of onHireApproved hook; failures are non-fatal to the approval flow. */
export interface HireApprovedHookResult {
  ok: boolean;
  error?: string;
  detail?: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Quota window types — used by adapters that can report provider quota/rate-limit state
// ---------------------------------------------------------------------------

/** a single rate-limit or usage window returned by a provider quota API */
export interface QuotaWindow {
  /** human label, e.g. "5h", "7d", "Sonnet 7d", "Credits" */
  label: string;
  /** percent of the window already consumed (0-100), null when not reported */
  usedPercent: number | null;
  /** iso timestamp when this window resets, null when not reported */
  resetsAt: string | null;
  /** free-form value label for credit-style windows, e.g. "$4.20 remaining" */
  valueLabel: string | null;
  /** optional supporting text, e.g. reset details or provider-specific notes */
  detail?: string | null;
}

/** result for one provider from getQuotaWindows() */
export interface ProviderQuotaResult {
  /** provider slug, e.g. "anthropic", "openai" */
  provider: string;
  /** source label when the provider reports where the quota data came from */
  source?: string | null;
  /** true when the fetch succeeded and windows is populated */
  ok: boolean;
  /** error message when ok is false */
  error?: string;
  windows: QuotaWindow[];
}

// ---------------------------------------------------------------------------
// Adapter config schema — declarative UI config for external adapters
// ---------------------------------------------------------------------------

export interface ConfigFieldOption {
  label: string;
  value: string;
  /** Optional group key for categorizing options (e.g. provider name) */
  group?: string;
}

export interface ConfigFieldSchema {
  key: string;
  label: string;
  type: "text" | "select" | "toggle" | "number" | "textarea" | "combobox";
  options?: ConfigFieldOption[];
  default?: unknown;
  hint?: string;
  required?: boolean;
  group?: string;
  /** Optional metadata — not rendered, but available to custom UI logic */
  meta?: Record<string, unknown>;
}

export interface AdapterConfigSchema {
  fields: ConfigFieldSchema[];
}

export interface ServerAdapterModule {
  type: string;
  execute(ctx: AdapterExecutionContext): Promise<AdapterExecutionResult>;
  testEnvironment(ctx: AdapterEnvironmentTestContext): Promise<AdapterEnvironmentTestResult>;
  listSkills?: (ctx: AdapterSkillContext) => Promise<AdapterSkillSnapshot>;
  syncSkills?: (ctx: AdapterSkillContext, desiredSkills: string[]) => Promise<AdapterSkillSnapshot>;
  sessionCodec?: AdapterSessionCodec;
  sessionManagement?: import("./session-compaction.js").AdapterSessionManagement;
  supportsLocalAgentJwt?: boolean;
  models?: AdapterModel[];
  listModels?: () => Promise<AdapterModel[]>;
  agentConfigurationDoc?: string;
  /**
   * Optional lifecycle hook when an agent is approved/hired (join-request or hire_agent approval).
   * adapterConfig is the agent's adapter config so the adapter can e.g. send a callback to a configured URL.
   */
  onHireApproved?: (
    payload: HireApprovedPayload,
    adapterConfig: Record<string, unknown>,
  ) => Promise<HireApprovedHookResult>;
  /**
   * Optional: fetch live provider quota/rate-limit windows for this adapter.
   * Returns a ProviderQuotaResult so the server can aggregate across adapters
   * without knowing provider-specific credential paths or API shapes.
   */
  getQuotaWindows?: () => Promise<ProviderQuotaResult>;
  /**
   * Optional: detect the currently configured model from local config files.
   * Returns the detected model/provider and the config source, or null if
   * the adapter does not support detection or no config is found.
   */
  detectModel?: () => Promise<{ model: string; provider: string; source: string; candidates?: string[] } | null>;
  /**
   * Optional: return a declarative config schema so the UI can render
   * adapter-specific form fields without shipping React components.
   * Dynamic options (e.g. scanning a profiles directory) should be
   * resolved inside this method — the caller receives a fully hydrated schema.
   */
  getConfigSchema?: () => Promise<AdapterConfigSchema> | AdapterConfigSchema;

  // ---------------------------------------------------------------------------
  // Adapter capability flags
  //
  // These allow adapter plugins to declare what "local" capabilities they
  // support, replacing hardcoded type lists in the server and UI.
  // All flags are optional — when undefined, the server falls back to
  // legacy hardcoded lists for built-in adapters.
  // ---------------------------------------------------------------------------

  /**
   * Adapter supports managed instructions bundle (AGENTS.md files).
   * When true, the server uses instructionsPathKey (default "instructionsFilePath")
   * to resolve the instructions config key, and the UI shows the bundle editor.
   * Built-in local adapters default to true; external plugins must opt in.
   */
  supportsInstructionsBundle?: boolean;

  /**
   * The adapterConfig key that holds the instructions file path.
   * Defaults to "instructionsFilePath" when supportsInstructionsBundle is true.
   */
  instructionsPathKey?: string;

  /**
   * Adapter needs runtime skill entries materialized (written to disk)
   * before being passed via config. Used by adapters that scan a directory
   * rather than reading config.paperclipRuntimeSkills.
   */
  requiresMaterializedRuntimeSkills?: boolean;

  /**
   * Optional Agent Runtime Broker (OSBAPI-shaped) for cloud/remote adapters.
   * When omitted (or describeBroker returns reachable=false / capabilities all
   * false), the adapter is treated as having no broker — all existing
   * skill/config flows continue to use the legacy listSkills/syncSkills path.
   */
  getBroker?: () => AgentRuntimeBroker;
}

// ---------------------------------------------------------------------------
// Agent Runtime Broker (OSBAPI-shaped) — for cloud/remote agent runtimes
// ---------------------------------------------------------------------------

/**
 * Top-level kinds of resources a runtime host can expose. The taxonomy splits
 * the original "agent_runtime" into runtime_host (the remote process itself,
 * registered/bound only) and agent_identity (a logical agent inside a host,
 * provisionable). agent_bundle is the unit of governance for skills, prompts,
 * MCP refs, model defaults and sub-agent profiles shipped together.
 */
export type AgentRuntimeKind =
  | "runtime_host"
  | "agent_identity"
  | "agent_bundle"
  | "mcp_server"
  | "config_profile"
  | "secret_bundle";

/**
 * Subtype of content that may be packaged inside an agent_bundle. Each
 * is reported per-content in actualState — not separately PUT-able.
 */
export type AgentBundleContentKind =
  | "skill"
  | "prompt"
  | "mcp_ref"
  | "model_default"
  | "subagent_profile";

const AGENT_BUNDLE_CONTENT_KIND_SET = new Set<AgentBundleContentKind>([
  "skill",
  "prompt",
  "mcp_ref",
  "model_default",
  "subagent_profile",
]);

/**
 * Type guard for {@link AgentBundleContentKind}. Use from broker
 * implementations to validate untrusted strings coming over the wire.
 */
export function isAgentBundleContentKind(
  value: unknown,
): value is AgentBundleContentKind {
  return (
    typeof value === "string"
    && AGENT_BUNDLE_CONTENT_KIND_SET.has(value as AgentBundleContentKind)
  );
}

export interface AgentRuntimeCatalogPlan {
  /** Plan identifier, e.g. "skills_only", "ceo", "engineer". */
  id: string;
  label: string;
  description?: string | null;
  /**
   * JSON Schema describing the desired_config payload accepted by the host
   * for this kind+plan. Reuses the same shape adapters publish for
   * config-schema. Null means the host accepts free-form config.
   */
  configSchema?: Record<string, unknown> | null;
  meta?: Record<string, unknown> | null;
}

export interface AgentRuntimeCatalogKind {
  kind: AgentRuntimeKind;
  /** Whether the broker can PUT instances of this kind. */
  provisionable: boolean;
  plans: AgentRuntimeCatalogPlan[];
  /**
   * For agent_bundle: which content subtypes the host can introspect and
   * report on. Honest UI uses this to disable forms the host won't accept.
   */
  supportedContents?: AgentBundleContentKind[];
}

export interface AgentRuntimeCatalogCapabilities {
  supportsAsync: boolean;
  supportsBindings: boolean;
  supportsAgentProvisioning: boolean;
  supportsBundleProvisioning: boolean;
  supportsConfigProfile: boolean;
  supportsMcpServer: boolean;
  supportsSecretBundle: boolean;
  /** When true, governed PUT/DELETE require an approval gate before push. */
  requiresApproval?: boolean;
}

export interface AgentRuntimeCatalog {
  /** The adapter type providing this broker (e.g. "openclaw_gateway"). */
  hostKind: string;
  /** Optional remote host build/version label. */
  hostVersion?: string | null;
  kinds: AgentRuntimeCatalogKind[];
  capabilities: AgentRuntimeCatalogCapabilities;
  fetchedAt: string;
}

export interface AgentRuntimeBrokerDescriptor {
  hostKind: string;
  /** True when the broker reached the remote and has a usable catalog. */
  reachable: boolean;
  /** Subset of capabilities resolved at describe time (no full catalog). */
  capabilities: AgentRuntimeCatalogCapabilities;
  catalog?: AgentRuntimeCatalog | null;
  /** Reason text when reachable=false. */
  reason?: string | null;
}

export type BrokerOperationState = "in_progress" | "succeeded" | "failed";

export interface BrokerOperation {
  id: string;
  state: BrokerOperationState;
  description?: string | null;
  /** Suggested polling interval for in_progress ops. */
  pollAfterMs?: number | null;
  /** Result payload on success. Never contains raw secret values. */
  result?: Record<string, unknown> | null;
  error?: { code?: string | null; message: string } | null;
}

export interface RuntimeInstanceContentEntry {
  kind: AgentBundleContentKind;
  key: string;
  state: "pending" | "installed" | "failed" | "removed";
  detail?: string | null;
}

export type RuntimeInstanceActualStatus =
  | "absent"
  | "pending"
  | "ready"
  | "failed";

export interface RuntimeInstanceState {
  instanceId: string;
  kind: AgentRuntimeKind;
  plan: string | null;
  actualStatus: RuntimeInstanceActualStatus;
  contents?: RuntimeInstanceContentEntry[] | null;
  detail?: string | null;
  observedAt: string;
}

export interface BrokerSecretRef {
  /** Logical key the remote uses to resolve, e.g. "anthropicApiKey". */
  key: string;
  /**
   * Bizbox secret ref (id/locator). Brokers MUST NOT echo raw values; the
   * remote either fetches at use-time via a binding credential, or stores it
   * by id only.
   */
  ref: string;
}

export interface BrokerCallContext {
  companyId: string;
  /** Bizbox agent record acting as the runtime host (or runtime client). */
  hostAgentId: string;
  /** Adapter type, e.g. "openclaw_gateway". */
  hostAdapterType: string;
  /**
   * Resolved adapter config (with secret references already materialized
   * into runtime values) — passed straight through to the broker so it can
   * dial the remote. Brokers must not log this verbatim.
   */
  hostAdapterConfig: Record<string, unknown>;
  /** Idempotency key supplied by the control plane. */
  idempotencyKey?: string;
  onLog?: (level: "info" | "warn" | "error", msg: string) => void;
}

export interface ProvisionInstanceInput {
  instanceId: string;
  kind: AgentRuntimeKind;
  plan: string | null;
  desiredConfig: Record<string, unknown>;
  secretRefs?: BrokerSecretRef[];
}

export interface ProvisionInstanceResult {
  operation: BrokerOperation;
  state?: RuntimeInstanceState | null;
}

export interface AgentRuntimeBroker {
  /** Capability discovery; safe to call without side effects. */
  describeBroker(ctx: BrokerCallContext): Promise<AgentRuntimeBrokerDescriptor>;
  getCatalog(ctx: BrokerCallContext): Promise<AgentRuntimeCatalog>;
  listInstances(
    ctx: BrokerCallContext,
    opts?: { kind?: AgentRuntimeKind },
  ): Promise<RuntimeInstanceState[]>;
  putInstance(
    ctx: BrokerCallContext,
    input: ProvisionInstanceInput,
  ): Promise<ProvisionInstanceResult>;
  deleteInstance(
    ctx: BrokerCallContext,
    input: { instanceId: string; kind: AgentRuntimeKind },
  ): Promise<ProvisionInstanceResult>;
  getOperation(
    ctx: BrokerCallContext,
    opId: string,
  ): Promise<BrokerOperation>;
}

// ---------------------------------------------------------------------------
// UI types (moved from ui/src/adapters/types.ts)
// ---------------------------------------------------------------------------

export type TranscriptEntry =
  | { kind: "assistant"; ts: string; text: string; delta?: boolean }
  | { kind: "thinking"; ts: string; text: string; delta?: boolean }
  | { kind: "user"; ts: string; text: string }
  | { kind: "tool_call"; ts: string; name: string; input: unknown; toolUseId?: string }
  | { kind: "tool_result"; ts: string; toolUseId: string; toolName?: string; content: string; isError: boolean }
  | { kind: "init"; ts: string; model: string; sessionId: string }
  | { kind: "result"; ts: string; text: string; inputTokens: number; outputTokens: number; cachedTokens: number; costUsd: number; subtype: string; isError: boolean; errors: string[] }
  | { kind: "stderr"; ts: string; text: string }
  | { kind: "system"; ts: string; text: string }
  | { kind: "stdout"; ts: string; text: string }
  | { kind: "diff"; ts: string; changeType: "add" | "remove" | "context" | "hunk" | "file_header" | "truncation"; text: string };

export type StdoutLineParser = (line: string, ts: string) => TranscriptEntry[];

// ---------------------------------------------------------------------------
// CLI types (moved from cli/src/adapters/types.ts)
// ---------------------------------------------------------------------------

export interface CLIAdapterModule {
  type: string;
  formatStdoutEvent: (line: string, debug: boolean) => void;
}

// ---------------------------------------------------------------------------
// UI config form values (moved from ui/src/components/AgentConfigForm.tsx)
// ---------------------------------------------------------------------------

export interface CreateConfigValues {
  adapterType: string;
  cwd: string;
  instructionsFilePath?: string;
  promptTemplate: string;
  model: string;
  thinkingEffort: string;
  chrome: boolean;
  dangerouslySkipPermissions: boolean;
  search: boolean;
  fastMode: boolean;
  dangerouslyBypassSandbox: boolean;
  command: string;
  args: string;
  extraArgs: string;
  envVars: string;
  envBindings: Record<string, unknown>;
  url: string;
  accessToken?: string;
  openClawSetupMode?: "token_only" | "token_and_device_pairing";
  apiKey?: string;
  timeoutSec?: number;
  bootstrapPrompt: string;
  payloadTemplateJson?: string;
  workspaceStrategyType?: string;
  workspaceBaseRef?: string;
  workspaceBranchTemplate?: string;
  worktreeParentDir?: string;
  runtimeServicesJson?: string;
  maxTurnsPerRun: number;
  heartbeatEnabled: boolean;
  intervalSec: number;
  /** Arbitrary key-value pairs populated by schema-driven config fields. */
  adapterSchemaValues?: Record<string, unknown>;
}
