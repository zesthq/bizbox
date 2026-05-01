import { randomUUID } from "node:crypto";
import { and, desc, eq } from "drizzle-orm";
import type { Db } from "@paperclipai/db";
import {
  agents,
  companies,
  runtimeBindings,
  runtimeHosts,
  runtimeInstances,
  runtimeOperations,
  runtimeSecretRefs,
} from "@paperclipai/db";
import type {
  AgentRuntimeBroker,
  AgentRuntimeBrokerDescriptor,
  AgentRuntimeCatalog,
  AgentRuntimeKind,
  BrokerCallContext,
  BrokerOperation,
  ProvisionInstanceInput,
  ProvisionInstanceResult,
  RuntimeInstanceState,
  ServerAdapterModule,
} from "@paperclipai/adapter-utils";
import type {
  BrokerOperationDTO,
  RuntimeInstanceDTO,
} from "@paperclipai/shared";
import { findActiveServerAdapter } from "../adapters/registry.js";
import { deduplicateAgentName } from "./agents.js";
import { secretService } from "./secrets.js";
import { logActivity } from "./activity-log.js";
import { validateAgainstJsonSchema } from "./plugin-config-validator.js";
import { conflict, forbidden, notFound, unprocessable } from "../errors.js";

const MAX_CATALOG_AGE_MS = 5 * 60_000; // 5 minutes

export interface BrokerActorRef {
  actorType: "user" | "agent" | "system" | "plugin";
  actorId: string;
  agentId?: string | null;
  runId?: string | null;
}

export class BrokerNotSupportedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BrokerNotSupportedError";
  }
}

interface ResolvedHostAgent {
  agentId: string;
  companyId: string;
  adapterType: string;
  adapterConfig: Record<string, unknown>;
  paused: boolean;
}

/**
 * BrokerRegistry resolves an Agent Runtime Broker for a given (companyId, hostAgentId)
 * pair. Refuses cross-company resolution.
 */
async function resolveHostAgent(
  db: Db,
  companyId: string,
  hostAgentId: string,
): Promise<ResolvedHostAgent> {
  const row = await db
    .select({
      id: agents.id,
      companyId: agents.companyId,
      adapterType: agents.adapterType,
      adapterConfig: agents.adapterConfig,
      status: agents.status,
      companyStatus: companies.status,
    })
    .from(agents)
    .leftJoin(companies, eq(agents.companyId, companies.id))
    .where(eq(agents.id, hostAgentId))
    .then((rows) => rows[0] ?? null);
  if (!row) throw notFound("Agent not found");
  if (row.companyId !== companyId) {
    throw forbidden("Agent is not in the requested company");
  }
  if (!row.adapterType) {
    throw unprocessable("Agent has no adapterType");
  }
  return {
    agentId: row.id,
    companyId: row.companyId,
    adapterType: row.adapterType,
    adapterConfig:
      (row.adapterConfig as Record<string, unknown> | null) ?? {},
    paused: row.companyStatus === "paused" || row.status === "paused",
  };
}

function getBrokerForAdapter(
  adapter: ServerAdapterModule | null,
): AgentRuntimeBroker | null {
  if (!adapter || typeof adapter.getBroker !== "function") return null;
  try {
    return adapter.getBroker();
  } catch {
    return null;
  }
}

async function buildBrokerContext(
  db: Db,
  host: ResolvedHostAgent,
  options: { idempotencyKey?: string; onLog?: BrokerCallContext["onLog"] } = {},
): Promise<BrokerCallContext> {
  const secretsSvc = secretService(db);
  const { config } = await secretsSvc.resolveAdapterConfigForRuntime(
    host.companyId,
    host.adapterConfig,
  );
  return {
    companyId: host.companyId,
    hostAgentId: host.agentId,
    hostAdapterType: host.adapterType,
    hostAdapterConfig: config,
    idempotencyKey: options.idempotencyKey,
    onLog: options.onLog,
  };
}

// ---------------------------------------------------------------------------
// Persistence helpers (DesiredStateStore)
// ---------------------------------------------------------------------------

async function ensureHost(db: Db, host: ResolvedHostAgent) {
  const existing = await db
    .select()
    .from(runtimeHosts)
    .where(
      and(
        eq(runtimeHosts.companyId, host.companyId),
        eq(runtimeHosts.agentId, host.agentId),
      ),
    )
    .then((rows) => rows[0] ?? null);
  if (existing) return existing;
  const [created] = await db
    .insert(runtimeHosts)
    .values({
      companyId: host.companyId,
      agentId: host.agentId,
      adapterType: host.adapterType,
    })
    .returning();
  return created;
}

async function recordOperation(
  db: Db,
  args: {
    companyId: string;
    hostId: string;
    instanceId?: string | null;
    kind: "put" | "delete" | "sync" | "catalog";
    op: BrokerOperation;
  },
) {
  const finished = args.op.state !== "in_progress";
  const [row] = await db
    .insert(runtimeOperations)
    .values({
      companyId: args.companyId,
      hostId: args.hostId,
      instanceId: args.instanceId ?? null,
      kind: args.kind,
      state: args.op.state,
      description: args.op.description ?? null,
      result: args.op.result ?? null,
      error: args.op.error ?? null,
      pollAfterMs: args.op.pollAfterMs ?? null,
      finishedAt: finished ? new Date() : null,
    })
    .returning();
  return row;
}

function toInstanceDTO(
  row: typeof runtimeInstances.$inferSelect,
  state: RuntimeInstanceState | null,
): RuntimeInstanceDTO {
  return {
    id: row.id,
    companyId: row.companyId,
    hostId: row.hostId,
    kind: row.kind as AgentRuntimeKind,
    plan: row.plan,
    desiredConfig:
      (row.desiredConfig as Record<string, unknown> | null) ?? {},
    actualStatus: state?.actualStatus ?? "absent",
    contents: state?.contents ?? null,
    status: row.status as RuntimeInstanceDTO["status"],
    statusReason: row.statusReason,
    lastOpId: row.lastOpId,
    lastReconciledAt: row.lastReconciledAt
      ? row.lastReconciledAt.toISOString()
      : null,
    approvalId: row.approvalId,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function toOperationDTO(
  row: typeof runtimeOperations.$inferSelect,
): BrokerOperationDTO {
  return {
    id: row.id,
    companyId: row.companyId,
    hostId: row.hostId,
    instanceId: row.instanceId,
    kind: row.kind as BrokerOperationDTO["kind"],
    state: row.state as BrokerOperationDTO["state"],
    description: row.description,
    result: row.result,
    error: row.error as BrokerOperationDTO["error"] | null,
    pollAfterMs: row.pollAfterMs,
    startedAt: row.startedAt.toISOString(),
    finishedAt: row.finishedAt ? row.finishedAt.toISOString() : null,
  };
}

// ---------------------------------------------------------------------------
// Service surface
// ---------------------------------------------------------------------------

export function agentRuntimeService(db: Db) {
  async function describe(
    companyId: string,
    hostAgentId: string,
  ): Promise<AgentRuntimeBrokerDescriptor> {
    const host = await resolveHostAgent(db, companyId, hostAgentId);
    const adapter = findActiveServerAdapter(host.adapterType);
    const broker = getBrokerForAdapter(adapter);
    if (!broker) {
      return {
        hostKind: host.adapterType,
        reachable: false,
        capabilities: {
          supportsAsync: false,
          supportsBindings: false,
          supportsAgentProvisioning: false,
          supportsBundleProvisioning: false,
          supportsConfigProfile: false,
          supportsMcpServer: false,
          supportsSecretBundle: false,
          requiresApproval: false,
        },
        catalog: null,
        reason: "adapter does not implement an Agent Runtime Broker",
      };
    }
    const ctx = await buildBrokerContext(db, host);
    return broker.describeBroker(ctx);
  }

  async function getCatalog(
    companyId: string,
    hostAgentId: string,
    opts: { force?: boolean } = {},
  ): Promise<AgentRuntimeCatalog> {
    const host = await resolveHostAgent(db, companyId, hostAgentId);
    const dbHost = await ensureHost(db, host);
    if (!opts.force && dbHost.catalogSnapshot && dbHost.catalogFetchedAt) {
      const ageMs = Date.now() - dbHost.catalogFetchedAt.getTime();
      if (ageMs < MAX_CATALOG_AGE_MS) {
        return dbHost.catalogSnapshot as unknown as AgentRuntimeCatalog;
      }
    }
    const adapter = findActiveServerAdapter(host.adapterType);
    const broker = getBrokerForAdapter(adapter);
    if (!broker) {
      throw new BrokerNotSupportedError(
        `Adapter ${host.adapterType} does not implement an Agent Runtime Broker`,
      );
    }
    const ctx = await buildBrokerContext(db, host);
    try {
      const catalog = await broker.getCatalog(ctx);
      await db
        .update(runtimeHosts)
        .set({
          catalogSnapshot: catalog as unknown as Record<string, unknown>,
          catalogFetchedAt: new Date(),
          reachable: true,
          lastReachableAt: new Date(),
          lastReason: null,
          updatedAt: new Date(),
        })
        .where(eq(runtimeHosts.id, dbHost.id));
      return catalog;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      await db
        .update(runtimeHosts)
        .set({
          reachable: false,
          lastReason: message,
          updatedAt: new Date(),
        })
        .where(eq(runtimeHosts.id, dbHost.id));
      throw err;
    }
  }

  async function listInstances(
    companyId: string,
    hostAgentId: string,
    opts: { kind?: AgentRuntimeKind } = {},
  ): Promise<RuntimeInstanceDTO[]> {
    const host = await resolveHostAgent(db, companyId, hostAgentId);
    const dbHost = await ensureHost(db, host);
    const conditions = [eq(runtimeInstances.hostId, dbHost.id)];
    if (opts.kind) conditions.push(eq(runtimeInstances.kind, opts.kind));
    const rows = await db
      .select()
      .from(runtimeInstances)
      .where(and(...conditions))
      .orderBy(desc(runtimeInstances.createdAt));

    // Best-effort fetch of fresh actual state from the broker. If the broker
    // is unreachable we still return desired state — UI shows "absent".
    let states: RuntimeInstanceState[] = [];
    const adapter = findActiveServerAdapter(host.adapterType);
    const broker = getBrokerForAdapter(adapter);
    if (broker) {
      try {
        const ctx = await buildBrokerContext(db, host);
        states = await broker.listInstances(ctx, opts);
      } catch {
        states = [];
      }
    }
    const stateById = new Map(states.map((s) => [s.instanceId, s]));
    return rows.map((row) => toInstanceDTO(row, stateById.get(row.id) ?? null));
  }

  async function putInstance(args: {
    companyId: string;
    hostAgentId: string;
    instanceId?: string;
    kind: AgentRuntimeKind;
    plan?: string | null;
    desiredConfig?: Record<string, unknown>;
    secretRefs?: Array<{ key: string; ref: string }>;
    actor: BrokerActorRef;
    idempotencyKey?: string;
  }): Promise<{
    instance: RuntimeInstanceDTO;
    operation: BrokerOperationDTO;
    hiredAgentId?: string | null;
  }> {
    const host = await resolveHostAgent(db, args.companyId, args.hostAgentId);
    if (host.paused) {
      throw conflict("Company or agent is paused; broker push is blocked");
    }
    const dbHost = await ensureHost(db, host);
    const adapter = findActiveServerAdapter(host.adapterType);
    const broker = getBrokerForAdapter(adapter);
    if (!broker) {
      throw new BrokerNotSupportedError(
        `Adapter ${host.adapterType} does not implement an Agent Runtime Broker`,
      );
    }

    const instanceId = args.instanceId ?? randomUUID();
    const desiredConfig = args.desiredConfig ?? {};

    // Step 3: validate desiredConfig against the matching catalog plan's
    // configSchema (when one is published). We use the cached snapshot to
    // avoid a second remote round-trip; if the host has never published a
    // catalog (e.g. fallback adapter) the validation is skipped.
    const cachedSnapshot = dbHost.catalogSnapshot as
      | { kinds?: Array<Record<string, unknown>> }
      | null;
    if (cachedSnapshot && Array.isArray(cachedSnapshot.kinds)) {
      const kindEntry = cachedSnapshot.kinds.find(
        (entry) => (entry as { kind?: string }).kind === args.kind,
      );
      const plansArray = Array.isArray((kindEntry as { plans?: unknown })?.plans)
        ? ((kindEntry as { plans: unknown[] }).plans as Array<
            Record<string, unknown>
          >)
        : [];
      const planEntry = args.plan
        ? plansArray.find((p) => p.id === args.plan)
        : plansArray.length === 1
          ? plansArray[0]
          : undefined;
      const schema = planEntry?.configSchema as
        | Record<string, unknown>
        | null
        | undefined;
      if (schema && typeof schema === "object") {
        const result = validateAgainstJsonSchema(desiredConfig, schema);
        if (!result.valid) {
          throw unprocessable(
            `desiredConfig does not match plan '${args.plan ?? "default"}' schema`,
            result.errors,
          );
        }
      }
    }

    // Find or create the desired-state row.
    const existing = await db
      .select()
      .from(runtimeInstances)
      .where(eq(runtimeInstances.id, instanceId))
      .then((rows) => rows[0] ?? null);
    if (existing && existing.companyId !== host.companyId) {
      throw forbidden("Instance is not in the requested company");
    }
    if (existing && existing.hostId !== dbHost.id) {
      throw conflict("Instance is bound to a different host");
    }

    const previousDesired =
      (existing?.desiredConfig as Record<string, unknown> | null) ?? null;

    let row: typeof runtimeInstances.$inferSelect;
    if (existing) {
      const [updated] = await db
        .update(runtimeInstances)
        .set({
          plan: args.plan ?? existing.plan,
          desiredConfig,
          status: "reconciling",
          statusReason: null,
          updatedAt: new Date(),
        })
        .where(eq(runtimeInstances.id, instanceId))
        .returning();
      row = updated;
    } else {
      const [created] = await db
        .insert(runtimeInstances)
        .values({
          id: instanceId,
          companyId: host.companyId,
          hostId: dbHost.id,
          kind: args.kind,
          plan: args.plan ?? null,
          desiredConfig,
          status: "reconciling",
        })
        .returning();
      row = created;
    }

    // Persist secret refs (replace-set semantics).
    if (args.secretRefs) {
      await db
        .delete(runtimeSecretRefs)
        .where(eq(runtimeSecretRefs.instanceId, instanceId));
      if (args.secretRefs.length > 0) {
        await db.insert(runtimeSecretRefs).values(
          args.secretRefs.map((r) => ({
            companyId: host.companyId,
            instanceId,
            refKey: r.key,
            secretRef: r.ref,
          })),
        );
      }
    }

    const ctx = await buildBrokerContext(db, host, {
      idempotencyKey: args.idempotencyKey ?? instanceId,
    });
    const input: ProvisionInstanceInput = {
      instanceId,
      kind: args.kind,
      plan: args.plan ?? null,
      desiredConfig,
      secretRefs: args.secretRefs,
    };

    let result: ProvisionInstanceResult;
    let pushError: { code?: string | null; message: string } | null = null;
    try {
      result = await broker.putInstance(ctx, input);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      pushError = { message };
      result = {
        operation: {
          id: randomUUID(),
          state: "failed",
          description: "broker putInstance failed",
          error: { message },
        },
        state: null,
      };
    }

    const opRow = await recordOperation(db, {
      companyId: host.companyId,
      hostId: dbHost.id,
      instanceId,
      kind: "put",
      op: result.operation,
    });

    const finalStatus =
      result.operation.state === "succeeded"
        ? "ready"
        : result.operation.state === "in_progress"
          ? "reconciling"
          : "failed";

    const [finalRow] = await db
      .update(runtimeInstances)
      .set({
        actualState: result.state
          ? (result.state as unknown as Record<string, unknown>)
          : null,
        status: finalStatus,
        statusReason: pushError?.message ?? result.operation.error?.message ?? null,
        lastReconciledAt: new Date(),
        lastOpId: opRow.id,
        updatedAt: new Date(),
      })
      .where(eq(runtimeInstances.id, instanceId))
      .returning();

    // Step 4 — "Hire on this host". When an agent_identity instance is
    // successfully provisioned and the operator opted into hiring, create a
    // Bizbox `agents` row whose adapter points back at this host so the new
    // identity can be invoked through the existing run pipeline. The
    // operation is idempotent: if a binding already exists for this instance
    // we skip the second hire.
    let hiredAgentId: string | null = null;
    if (
      args.kind === "agent_identity"
      && result.operation.state === "succeeded"
      && (desiredConfig as Record<string, unknown>).hireAgent === true
    ) {
      const existingBinding = await db
        .select()
        .from(runtimeBindings)
        .where(
          and(
            eq(runtimeBindings.instanceId, instanceId),
            eq(runtimeBindings.boundEntityKind, "agent"),
          ),
        )
        .then((rows) => rows[0] ?? null);
      if (existingBinding) {
        hiredAgentId = existingBinding.boundEntityId;
      } else {
        const desiredName =
          typeof (desiredConfig as Record<string, unknown>).name === "string"
            ? ((desiredConfig as Record<string, unknown>).name as string)
            : `${host.adapterType}-agent`;
        const desiredRole =
          typeof (desiredConfig as Record<string, unknown>).role === "string"
            ? ((desiredConfig as Record<string, unknown>).role as string)
            : "general";
        // We must avoid duplicate names within the company.
        const existingAgents = await db
          .select({
            id: agents.id,
            name: agents.name,
            status: agents.status,
          })
          .from(agents)
          .where(eq(agents.companyId, host.companyId));
        const uniqueName = deduplicateAgentName(desiredName, existingAgents);

        const [createdAgent] = await db
          .insert(agents)
          .values({
            companyId: host.companyId,
            name: uniqueName,
            role: desiredRole,
            adapterType: host.adapterType,
            // Inherit the host's adapter config so the new agent can dial
            // the same runtime. The runtime instance id is recorded in
            // metadata so future reconciles can find the host.
            adapterConfig: host.adapterConfig,
            metadata: {
              hiredFromRuntimeInstance: instanceId,
              hiredFromHostAgent: host.agentId,
            },
            status: "active",
          })
          .returning();
        hiredAgentId = createdAgent.id;

        await db.insert(runtimeBindings).values({
          companyId: host.companyId,
          instanceId,
          boundEntityKind: "agent",
          boundEntityId: createdAgent.id,
          credentialsRef:
            typeof (
              result.state as unknown as Record<string, unknown> | null
            )?.credentialsRef === "string"
              ? ((result.state as unknown as Record<string, unknown>)
                  .credentialsRef as string)
              : null,
        });
      }
    }

    await logActivity(db, {
      companyId: host.companyId,
      actorType: args.actor.actorType,
      actorId: args.actor.actorId,
      action: "runtime.instance.put",
      entityType: "runtime_instance",
      entityId: instanceId,
      agentId: args.actor.agentId ?? args.hostAgentId,
      runId: args.actor.runId ?? null,
      details: {
        adapterType: host.adapterType,
        kind: args.kind,
        plan: args.plan ?? null,
        previousDesired,
        nextDesired: desiredConfig,
        operationState: result.operation.state,
        operationId: opRow.id,
        // Secret refs are summarized (keys only) — never echo raw values.
        secretRefKeys: args.secretRefs?.map((r) => r.key) ?? null,
        ...(hiredAgentId ? { hiredAgentId } : {}),
        ...(pushError ? { error: pushError.message } : {}),
      },
    });

    return {
      instance: toInstanceDTO(finalRow, result.state ?? null),
      operation: toOperationDTO(opRow),
      hiredAgentId,
    };
  }

  async function deleteInstance(args: {
    companyId: string;
    hostAgentId: string;
    instanceId: string;
    actor: BrokerActorRef;
  }): Promise<{ operation: BrokerOperationDTO }> {
    const host = await resolveHostAgent(db, args.companyId, args.hostAgentId);
    if (host.paused) {
      throw conflict("Company or agent is paused; broker push is blocked");
    }
    const dbHost = await ensureHost(db, host);
    const existing = await db
      .select()
      .from(runtimeInstances)
      .where(eq(runtimeInstances.id, args.instanceId))
      .then((rows) => rows[0] ?? null);
    if (!existing) throw notFound("Runtime instance not found");
    if (existing.companyId !== host.companyId) {
      throw forbidden("Instance is not in the requested company");
    }
    if (existing.hostId !== dbHost.id) {
      throw conflict("Instance is bound to a different host");
    }

    const adapter = findActiveServerAdapter(host.adapterType);
    const broker = getBrokerForAdapter(adapter);

    let result: ProvisionInstanceResult;
    if (broker) {
      const ctx = await buildBrokerContext(db, host, {
        idempotencyKey: args.instanceId,
      });
      try {
        result = await broker.deleteInstance(ctx, {
          instanceId: args.instanceId,
          kind: existing.kind as AgentRuntimeKind,
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        result = {
          operation: {
            id: randomUUID(),
            state: "failed",
            description: "broker deleteInstance failed",
            error: { message },
          },
          state: null,
        };
      }
    } else {
      result = {
        operation: {
          id: randomUUID(),
          state: "succeeded",
          description: "no broker; removed from desired state only",
        },
        state: null,
      };
    }

    const opRow = await recordOperation(db, {
      companyId: host.companyId,
      hostId: dbHost.id,
      instanceId: args.instanceId,
      kind: "delete",
      op: result.operation,
    });

    if (result.operation.state === "succeeded") {
      await db
        .delete(runtimeBindings)
        .where(eq(runtimeBindings.instanceId, args.instanceId));
      await db
        .delete(runtimeSecretRefs)
        .where(eq(runtimeSecretRefs.instanceId, args.instanceId));
      await db
        .delete(runtimeInstances)
        .where(eq(runtimeInstances.id, args.instanceId));
    } else {
      await db
        .update(runtimeInstances)
        .set({
          status:
            result.operation.state === "in_progress" ? "deprovisioning" : "failed",
          statusReason: result.operation.error?.message ?? null,
          lastOpId: opRow.id,
          updatedAt: new Date(),
        })
        .where(eq(runtimeInstances.id, args.instanceId));
    }

    await logActivity(db, {
      companyId: host.companyId,
      actorType: args.actor.actorType,
      actorId: args.actor.actorId,
      action: "runtime.instance.delete",
      entityType: "runtime_instance",
      entityId: args.instanceId,
      agentId: args.actor.agentId ?? args.hostAgentId,
      runId: args.actor.runId ?? null,
      details: {
        adapterType: host.adapterType,
        kind: existing.kind,
        plan: existing.plan,
        operationState: result.operation.state,
        operationId: opRow.id,
      },
    });

    return { operation: toOperationDTO(opRow) };
  }

  async function syncNow(args: {
    companyId: string;
    hostAgentId: string;
    actor: BrokerActorRef;
  }): Promise<{ operation: BrokerOperationDTO; reconciled: number }> {
    const host = await resolveHostAgent(db, args.companyId, args.hostAgentId);
    if (host.paused) {
      throw conflict("Company or agent is paused; reconciler is gated");
    }
    const dbHost = await ensureHost(db, host);

    const desired = await db
      .select()
      .from(runtimeInstances)
      .where(eq(runtimeInstances.hostId, dbHost.id));

    const adapter = findActiveServerAdapter(host.adapterType);
    const broker = getBrokerForAdapter(adapter);
    if (!broker) {
      throw new BrokerNotSupportedError(
        `Adapter ${host.adapterType} does not implement an Agent Runtime Broker`,
      );
    }
    const ctx = await buildBrokerContext(db, host);

    let reconciled = 0;
    let failure: string | null = null;
    for (const row of desired) {
      try {
        const result = await broker.putInstance(ctx, {
          instanceId: row.id,
          kind: row.kind as AgentRuntimeKind,
          plan: row.plan,
          desiredConfig:
            (row.desiredConfig as Record<string, unknown> | null) ?? {},
        });
        const opRow = await recordOperation(db, {
          companyId: host.companyId,
          hostId: dbHost.id,
          instanceId: row.id,
          kind: "put",
          op: result.operation,
        });
        await db
          .update(runtimeInstances)
          .set({
            actualState: result.state
              ? (result.state as unknown as Record<string, unknown>)
              : null,
            status:
              result.operation.state === "succeeded"
                ? "ready"
                : result.operation.state === "in_progress"
                  ? "reconciling"
                  : "failed",
            statusReason: result.operation.error?.message ?? null,
            lastReconciledAt: new Date(),
            lastOpId: opRow.id,
            updatedAt: new Date(),
          })
          .where(eq(runtimeInstances.id, row.id));
        if (result.operation.state !== "failed") reconciled += 1;
      } catch (err) {
        failure = err instanceof Error ? err.message : String(err);
      }
    }

    const summaryOp: BrokerOperation = failure
      ? {
          id: randomUUID(),
          state: "failed",
          description: `sync failed: ${failure}`,
          error: { message: failure },
        }
      : {
          id: randomUUID(),
          state: "succeeded",
          description: `reconciled ${reconciled}/${desired.length} instances`,
        };
    const opRow = await recordOperation(db, {
      companyId: host.companyId,
      hostId: dbHost.id,
      instanceId: null,
      kind: "sync",
      op: summaryOp,
    });

    await logActivity(db, {
      companyId: host.companyId,
      actorType: args.actor.actorType,
      actorId: args.actor.actorId,
      action: "runtime.sync",
      entityType: "runtime_host",
      entityId: dbHost.id,
      agentId: args.actor.agentId ?? args.hostAgentId,
      runId: args.actor.runId ?? null,
      details: {
        adapterType: host.adapterType,
        reconciled,
        total: desired.length,
        operationId: opRow.id,
        ...(failure ? { error: failure } : {}),
      },
    });

    return { operation: toOperationDTO(opRow), reconciled };
  }

  async function getOperation(
    companyId: string,
    hostAgentId: string,
    operationId: string,
  ): Promise<BrokerOperationDTO> {
    const host = await resolveHostAgent(db, companyId, hostAgentId);
    const dbHost = await ensureHost(db, host);
    const row = await db
      .select()
      .from(runtimeOperations)
      .where(eq(runtimeOperations.id, operationId))
      .then((rows) => rows[0] ?? null);
    if (!row) throw notFound("Operation not found");
    if (row.companyId !== host.companyId || row.hostId !== dbHost.id) {
      throw forbidden("Operation is not in the requested host scope");
    }
    return toOperationDTO(row);
  }

  return {
    describe,
    getCatalog,
    listInstances,
    putInstance,
    deleteInstance,
    syncNow,
    getOperation,
  };
}

export type AgentRuntimeService = ReturnType<typeof agentRuntimeService>;
