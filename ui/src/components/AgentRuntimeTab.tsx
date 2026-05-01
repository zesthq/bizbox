import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  AgentRuntimeKind,
  BrokerDescriptorDTO,
  RuntimeInstanceDTO,
} from "@paperclipai/shared";
import { agentRuntimeApi } from "../api/agentRuntime";
import { Button } from "@/components/ui/button";

const RUNTIME_QK = {
  describe: (companyId: string, agentId: string) =>
    ["runtime", companyId, agentId, "describe"] as const,
  catalog: (companyId: string, agentId: string) =>
    ["runtime", companyId, agentId, "catalog"] as const,
  instances: (companyId: string, agentId: string) =>
    ["runtime", companyId, agentId, "instances"] as const,
};

interface AgentRuntimeTabProps {
  agentId: string;
  companyId: string;
}

export function AgentRuntimeTab({ agentId, companyId }: AgentRuntimeTabProps) {
  const queryClient = useQueryClient();
  const [actionError, setActionError] = useState<string | null>(null);

  const describeQuery = useQuery({
    queryKey: RUNTIME_QK.describe(companyId, agentId),
    queryFn: () => agentRuntimeApi.describe(companyId, agentId),
  });

  const instancesQuery = useQuery({
    queryKey: RUNTIME_QK.instances(companyId, agentId),
    queryFn: () => agentRuntimeApi.listInstances(companyId, agentId),
  });

  const refreshCatalog = useMutation({
    mutationFn: () => agentRuntimeApi.catalog(companyId, agentId, true),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: RUNTIME_QK.describe(companyId, agentId),
      });
      setActionError(null);
    },
    onError: (err) => setActionError(err instanceof Error ? err.message : String(err)),
  });

  const sync = useMutation({
    mutationFn: () => agentRuntimeApi.sync(companyId, agentId),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: RUNTIME_QK.instances(companyId, agentId),
      });
      setActionError(null);
    },
    onError: (err) => setActionError(err instanceof Error ? err.message : String(err)),
  });

  const deleteInstance = useMutation({
    mutationFn: (instanceId: string) =>
      agentRuntimeApi.deleteInstance(companyId, agentId, instanceId),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: RUNTIME_QK.instances(companyId, agentId),
      });
      setActionError(null);
    },
    onError: (err) => setActionError(err instanceof Error ? err.message : String(err)),
  });

  const descriptor = describeQuery.data;
  const instances = instancesQuery.data?.instances ?? [];

  const supportedKinds = useMemo<AgentRuntimeKind[]>(() => {
    const catalog = descriptor?.catalog ?? null;
    if (!catalog) return [];
    return catalog.kinds
      .filter((k) => k.provisionable)
      .map((k) => k.kind);
  }, [descriptor]);

  return (
    <div className="space-y-6">
      <BrokerStatusCard
        descriptor={descriptor ?? null}
        loading={describeQuery.isLoading}
        onRefresh={() => refreshCatalog.mutate()}
        refreshing={refreshCatalog.isPending}
      />

      {actionError && (
        <p className="text-sm text-destructive">{actionError}</p>
      )}

      {descriptor?.reachable && (
        <div className="flex items-center justify-between rounded-md border border-border/60 bg-muted/30 p-3">
          <div>
            <div className="font-medium">Desired-state instances</div>
            <div className="text-sm text-muted-foreground">
              Bizbox tracks {instances.length} instance(s) for this host.
              The reconciler pushes desired config to the remote runtime.
            </div>
          </div>
          <Button
            size="sm"
            onClick={() => sync.mutate()}
            disabled={sync.isPending}
          >
            {sync.isPending ? "Syncing…" : "Sync now"}
          </Button>
        </div>
      )}

      <InstancesTable
        instances={instances}
        loading={instancesQuery.isLoading}
        onDelete={(id) => deleteInstance.mutate(id)}
      />

      {descriptor?.reachable && supportedKinds.length > 0 && (
        <CatalogPlansList
          descriptor={descriptor}
          companyId={companyId}
          agentId={agentId}
          onCreated={() =>
            queryClient.invalidateQueries({
              queryKey: RUNTIME_QK.instances(companyId, agentId),
            })
          }
          setError={setActionError}
        />
      )}
    </div>
  );
}

function BrokerStatusCard({
  descriptor,
  loading,
  onRefresh,
  refreshing,
}: {
  descriptor: BrokerDescriptorDTO | null;
  loading: boolean;
  onRefresh: () => void;
  refreshing: boolean;
}) {
  if (loading) {
    return <p className="text-sm text-muted-foreground">Probing remote broker…</p>;
  }
  if (!descriptor) {
    return <p className="text-sm text-muted-foreground">No broker information.</p>;
  }
  const caps = descriptor.capabilities;
  const reachableLabel = descriptor.reachable ? "Reachable" : "Unreachable";
  return (
    <div className="space-y-3 rounded-md border border-border/60 bg-card p-4">
      <div className="flex items-center justify-between">
        <div>
          <div className="text-sm text-muted-foreground">Runtime host</div>
          <div className="text-lg font-semibold">{descriptor.hostKind}</div>
        </div>
        <div className="flex items-center gap-3">
          <span
            className={
              descriptor.reachable
                ? "rounded-full bg-emerald-500/15 px-2 py-1 text-xs font-medium text-emerald-700 dark:text-emerald-300"
                : "rounded-full bg-amber-500/15 px-2 py-1 text-xs font-medium text-amber-700 dark:text-amber-300"
            }
          >
            {reachableLabel}
          </span>
          <Button
            variant="outline"
            size="sm"
            onClick={onRefresh}
            disabled={refreshing}
          >
            {refreshing ? "Refreshing…" : "Refresh catalog"}
          </Button>
        </div>
      </div>
      {descriptor.reason && (
        <p className="text-sm text-muted-foreground">{descriptor.reason}</p>
      )}
      <dl className="grid grid-cols-2 gap-2 text-sm">
        <CapabilityFlag label="Bundle provisioning" value={caps.supportsBundleProvisioning} />
        <CapabilityFlag label="Agent provisioning" value={caps.supportsAgentProvisioning} />
        <CapabilityFlag label="Config profile" value={caps.supportsConfigProfile} />
        <CapabilityFlag label="MCP server" value={caps.supportsMcpServer} />
        <CapabilityFlag label="Secret bundle" value={caps.supportsSecretBundle} />
        <CapabilityFlag label="Bindings" value={caps.supportsBindings} />
        <CapabilityFlag label="Async" value={caps.supportsAsync} />
        <CapabilityFlag label="Requires approval" value={Boolean(caps.requiresApproval)} />
      </dl>
    </div>
  );
}

function CapabilityFlag({ label, value }: { label: string; value: boolean }) {
  return (
    <div className="flex items-center justify-between gap-2 rounded border border-border/40 px-2 py-1">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className={value ? "text-emerald-600 dark:text-emerald-300" : "text-muted-foreground"}>
        {value ? "yes" : "no"}
      </dd>
    </div>
  );
}

function InstancesTable({
  instances,
  loading,
  onDelete,
}: {
  instances: RuntimeInstanceDTO[];
  loading: boolean;
  onDelete: (id: string) => void;
}) {
  if (loading) return <p className="text-sm text-muted-foreground">Loading instances…</p>;
  if (instances.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        No runtime instances are currently provisioned for this host.
      </p>
    );
  }
  return (
    <div className="overflow-hidden rounded-md border border-border/60">
      <table className="w-full text-sm">
        <thead className="bg-muted/30 text-left">
          <tr>
            <th className="px-3 py-2 font-medium">Kind</th>
            <th className="px-3 py-2 font-medium">Plan</th>
            <th className="px-3 py-2 font-medium">Desired</th>
            <th className="px-3 py-2 font-medium">Actual</th>
            <th className="px-3 py-2 font-medium">Status</th>
            <th className="px-3 py-2"></th>
          </tr>
        </thead>
        <tbody>
          {instances.map((inst) => (
            <tr key={inst.id} className="border-t border-border/40">
              <td className="px-3 py-2 font-mono text-xs">{inst.kind}</td>
              <td className="px-3 py-2 text-xs">{inst.plan ?? "—"}</td>
              <td className="px-3 py-2 text-xs">
                <code className="rounded bg-muted px-1 py-0.5">
                  {Object.keys(inst.desiredConfig).length} key(s)
                </code>
              </td>
              <td className="px-3 py-2 text-xs">{inst.actualStatus}</td>
              <td className="px-3 py-2 text-xs">
                <span title={inst.statusReason ?? undefined}>{inst.status}</span>
              </td>
              <td className="px-3 py-2 text-right">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    if (window.confirm(`Deprovision ${inst.kind} instance?`)) {
                      onDelete(inst.id);
                    }
                  }}
                >
                  Deprovision
                </Button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function CatalogPlansList({
  descriptor,
  companyId,
  agentId,
  onCreated,
  setError,
}: {
  descriptor: BrokerDescriptorDTO;
  companyId: string;
  agentId: string;
  onCreated: () => void;
  setError: (message: string | null) => void;
}) {
  const provisionable = useMemo(
    () => descriptor.catalog?.kinds.filter((k) => k.provisionable) ?? [],
    [descriptor],
  );

  const create = useMutation({
    mutationFn: ({
      kind,
      plan,
      hireAgent,
    }: {
      kind: AgentRuntimeKind;
      plan: string | null;
      hireAgent?: boolean;
    }) =>
      agentRuntimeApi.createInstance(companyId, agentId, {
        kind,
        plan,
        desiredConfig: hireAgent ? { hireAgent: true } : {},
      }),
    onSuccess: () => {
      setError(null);
      onCreated();
    },
    onError: (err) =>
      setError(err instanceof Error ? err.message : String(err)),
  });

  if (provisionable.length === 0) return null;

  return (
    <div className="space-y-2 rounded-md border border-border/60 bg-card p-4">
      <div className="text-sm font-semibold">Catalog</div>
      <p className="text-xs text-muted-foreground">
        Plans this host advertises. Click to create a default desired-state instance —
        it will be reconciled with empty config until you populate it.
      </p>
      <ul className="space-y-2">
        {provisionable.map((kind) => (
          <li
            key={kind.kind}
            className="rounded border border-border/40 bg-muted/20 p-2"
          >
            <div className="flex items-center justify-between">
              <span className="font-mono text-xs">{kind.kind}</span>
              <span className="text-xs text-muted-foreground">
                {kind.plans.length} plan(s)
              </span>
            </div>
            <div className="mt-2 flex flex-wrap gap-2">
              {kind.plans.map((plan) => (
                <Button
                  key={plan.id}
                  size="sm"
                  variant="outline"
                  disabled={create.isPending}
                  onClick={() =>
                    create.mutate({ kind: kind.kind, plan: plan.id })
                  }
                >
                  + {plan.label}
                </Button>
              ))}
              {kind.plans.length === 0 && (
                <Button
                  size="sm"
                  variant="outline"
                  disabled={create.isPending}
                  onClick={() => create.mutate({ kind: kind.kind, plan: null })}
                >
                  + default
                </Button>
              )}
              {kind.kind === "agent_identity" && (
                <Button
                  size="sm"
                  disabled={create.isPending}
                  onClick={() =>
                    create.mutate({
                      kind: kind.kind,
                      plan: kind.plans[0]?.id ?? null,
                      hireAgent: true,
                    })
                  }
                >
                  Hire on this host
                </Button>
              )}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
