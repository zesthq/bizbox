/**
 * Wire DTOs for the Agent Runtime Broker (OSBAPI-shaped). Mirrors the
 * adapter-utils interface but lives in @paperclipai/shared so the UI and
 * server share types.
 */

export const AGENT_RUNTIME_KINDS = [
  "runtime_host",
  "agent_identity",
  "agent_bundle",
  "mcp_server",
  "config_profile",
  "secret_bundle",
] as const;

export type AgentRuntimeKind = (typeof AGENT_RUNTIME_KINDS)[number];

export const AGENT_BUNDLE_CONTENT_KINDS = [
  "skill",
  "prompt",
  "mcp_ref",
  "model_default",
  "subagent_profile",
] as const;

export type AgentBundleContentKind = (typeof AGENT_BUNDLE_CONTENT_KINDS)[number];

export const RUNTIME_INSTANCE_ACTUAL_STATUSES = [
  "absent",
  "pending",
  "ready",
  "failed",
] as const;

export type RuntimeInstanceActualStatus =
  (typeof RUNTIME_INSTANCE_ACTUAL_STATUSES)[number];

export const RUNTIME_INSTANCE_STATUSES = [
  "pending",
  "reconciling",
  "ready",
  "failed",
  "deprovisioning",
] as const;

export type RuntimeInstanceStatus = (typeof RUNTIME_INSTANCE_STATUSES)[number];

export const BROKER_OPERATION_STATES = [
  "in_progress",
  "succeeded",
  "failed",
] as const;

export type BrokerOperationState = (typeof BROKER_OPERATION_STATES)[number];

export interface AgentRuntimeCatalogPlanDTO {
  id: string;
  label: string;
  description?: string | null;
  configSchema?: Record<string, unknown> | null;
  meta?: Record<string, unknown> | null;
}

export interface AgentRuntimeCatalogKindDTO {
  kind: AgentRuntimeKind;
  provisionable: boolean;
  plans: AgentRuntimeCatalogPlanDTO[];
  supportedContents?: AgentBundleContentKind[];
}

export interface AgentRuntimeCatalogCapabilitiesDTO {
  supportsAsync: boolean;
  supportsBindings: boolean;
  supportsAgentProvisioning: boolean;
  supportsBundleProvisioning: boolean;
  supportsConfigProfile: boolean;
  supportsMcpServer: boolean;
  supportsSecretBundle: boolean;
  requiresApproval?: boolean;
}

export interface AgentRuntimeCatalogDTO {
  hostKind: string;
  hostVersion?: string | null;
  kinds: AgentRuntimeCatalogKindDTO[];
  capabilities: AgentRuntimeCatalogCapabilitiesDTO;
  fetchedAt: string;
}

export interface BrokerDescriptorDTO {
  hostKind: string;
  reachable: boolean;
  capabilities: AgentRuntimeCatalogCapabilitiesDTO;
  catalog?: AgentRuntimeCatalogDTO | null;
  reason?: string | null;
}

export interface RuntimeInstanceContentDTO {
  kind: AgentBundleContentKind;
  key: string;
  state: "pending" | "installed" | "failed" | "removed";
  detail?: string | null;
}

export interface RuntimeInstanceDTO {
  id: string;
  companyId: string;
  hostId: string;
  kind: AgentRuntimeKind;
  plan: string | null;
  desiredConfig: Record<string, unknown>;
  actualStatus: RuntimeInstanceActualStatus;
  contents?: RuntimeInstanceContentDTO[] | null;
  status: RuntimeInstanceStatus;
  statusReason?: string | null;
  lastOpId?: string | null;
  lastReconciledAt?: string | null;
  approvalId?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface BrokerOperationDTO {
  id: string;
  companyId: string;
  hostId: string;
  instanceId: string | null;
  kind: "put" | "delete" | "sync" | "catalog";
  state: BrokerOperationState;
  description?: string | null;
  result?: Record<string, unknown> | null;
  error?: { code?: string | null; message: string } | null;
  pollAfterMs?: number | null;
  startedAt: string;
  finishedAt?: string | null;
}

export interface PutRuntimeInstanceRequest {
  kind: AgentRuntimeKind;
  plan?: string | null;
  desiredConfig?: Record<string, unknown>;
  /** Logical key → secret_ref pairs (refs only, never raw values). */
  secretRefs?: Array<{ key: string; ref: string }>;
  idempotencyKey?: string;
}
