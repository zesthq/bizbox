import { randomUUID } from "node:crypto";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import {
  activityLog,
  agents,
  companies,
  createDb,
  runtimeBindings,
  runtimeHosts,
  runtimeInstances,
  runtimeOperations,
  runtimeSecretRefs,
  getEmbeddedPostgresTestSupport,
  startEmbeddedPostgresTestDatabase,
} from "@paperclipai/db";
import { agentRuntimeService } from "../services/agent-runtime.ts";

const embeddedPostgresSupport = await getEmbeddedPostgresTestSupport();
const describeEmbeddedPostgres = embeddedPostgresSupport.supported ? describe : describe.skip;

if (!embeddedPostgresSupport.supported) {
  console.warn(
    `Skipping embedded Postgres agent runtime service tests on this host: ${embeddedPostgresSupport.reason ?? "unsupported environment"}`,
  );
}

describeEmbeddedPostgres("agentRuntimeService.deleteInstance", () => {
  let stopDb: (() => Promise<void>) | null = null;
  let db!: ReturnType<typeof createDb>;

  beforeAll(async () => {
    const started = await startEmbeddedPostgresTestDatabase("agent-runtime-service");
    stopDb = started.stop;
    db = createDb(started.connectionString);
  });

  afterEach(async () => {
    await db.delete(activityLog);
    await db.delete(runtimeBindings);
    await db.delete(runtimeSecretRefs);
    await db.delete(runtimeInstances);
    await db.delete(runtimeOperations);
    await db.delete(runtimeHosts);
    await db.delete(agents);
    await db.delete(companies);
  });

  afterAll(async () => {
    await stopDb?.();
  });

  it("terminates hired bound agents when instance delete succeeds", async () => {
    const companyId = randomUUID();
    const hostAgentId = randomUUID();
    const hiredAgentId = randomUUID();
    const runtimeHostId = randomUUID();
    const instanceId = randomUUID();

    await db.insert(companies).values({
      id: companyId,
      name: "Acme",
      status: "active",
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    await db.insert(agents).values({
      id: hostAgentId,
      companyId,
      name: "Runtime Host",
      role: "engineer",
      status: "active",
      adapterType: "process",
      adapterConfig: {},
      runtimeConfig: {},
      permissions: {},
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    await db.insert(agents).values({
      id: hiredAgentId,
      companyId,
      name: "Provisioned Agent",
      role: "general",
      status: "active",
      adapterType: "process",
      adapterConfig: {},
      runtimeConfig: {},
      permissions: {},
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    await db.insert(runtimeHosts).values({
      id: runtimeHostId,
      companyId,
      agentId: hostAgentId,
      adapterType: "process",
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    await db.insert(runtimeInstances).values({
      id: instanceId,
      companyId,
      hostId: runtimeHostId,
      kind: "agent_identity",
      desiredConfig: { hireAgent: true },
      status: "ready",
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    await db.insert(runtimeBindings).values({
      companyId,
      instanceId,
      boundEntityKind: "agent",
      boundEntityId: hiredAgentId,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    await db.insert(runtimeSecretRefs).values({
      companyId,
      instanceId,
      refKey: "token",
      secretRef: "secret://token",
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const svc = agentRuntimeService(db);
    await svc.deleteInstance({
      companyId,
      hostAgentId,
      instanceId,
      actor: {
        actorType: "user",
        actorId: "u_1",
      },
    });

    const hiredAgent = await db
      .select()
      .from(agents)
      .where(eq(agents.id, hiredAgentId))
      .then((rows) => rows[0] ?? null);
    expect(hiredAgent?.status).toBe("terminated");

    const bindings = await db
      .select()
      .from(runtimeBindings)
      .where(eq(runtimeBindings.instanceId, instanceId));
    expect(bindings).toHaveLength(0);

    const refs = await db
      .select()
      .from(runtimeSecretRefs)
      .where(eq(runtimeSecretRefs.instanceId, instanceId));
    expect(refs).toHaveLength(0);

    const instances = await db
      .select()
      .from(runtimeInstances)
      .where(eq(runtimeInstances.id, instanceId));
    expect(instances).toHaveLength(0);

    const logEntry = await db
      .select()
      .from(activityLog)
      .where(eq(activityLog.entityId, instanceId))
      .then((rows) => rows.find((row) => row.action === "runtime.instance.delete") ?? null);
    const details = (logEntry?.details ?? null) as Record<string, unknown> | null;
    expect(details?.deactivatedAgentIds).toEqual([hiredAgentId]);
  });
});
