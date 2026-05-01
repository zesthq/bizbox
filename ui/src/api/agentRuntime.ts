import type {
  AgentRuntimeCatalogDTO,
  BrokerDescriptorDTO,
  BrokerOperationDTO,
  PutRuntimeInstanceRequest,
  RuntimeInstanceDTO,
} from "@paperclipai/shared";
import { api } from "./client";

const base = (companyId: string, agentId: string) =>
  `/companies/${encodeURIComponent(companyId)}/runtimes/${encodeURIComponent(agentId)}`;

export interface PutInstanceResponse {
  instance: RuntimeInstanceDTO;
  operation: BrokerOperationDTO;
}

export interface DeleteInstanceResponse {
  operation: BrokerOperationDTO;
}

export interface SyncRuntimeResponse {
  operation: BrokerOperationDTO;
  reconciled: number;
}

export const agentRuntimeApi = {
  describe: (companyId: string, agentId: string) =>
    api.get<BrokerDescriptorDTO>(`${base(companyId, agentId)}/describe`),

  catalog: (companyId: string, agentId: string, force = false) =>
    api.get<AgentRuntimeCatalogDTO>(
      `${base(companyId, agentId)}/catalog${force ? "?force=1" : ""}`,
    ),

  listInstances: (
    companyId: string,
    agentId: string,
    opts: { kind?: string } = {},
  ) => {
    const qs = opts.kind ? `?kind=${encodeURIComponent(opts.kind)}` : "";
    return api.get<{ instances: RuntimeInstanceDTO[] }>(
      `${base(companyId, agentId)}/instances${qs}`,
    );
  },

  putInstance: (
    companyId: string,
    agentId: string,
    instanceId: string,
    body: PutRuntimeInstanceRequest,
  ) =>
    api.put<PutInstanceResponse>(
      `${base(companyId, agentId)}/instances/${encodeURIComponent(instanceId)}`,
      body,
    ),

  createInstance: (
    companyId: string,
    agentId: string,
    body: PutRuntimeInstanceRequest,
  ) =>
    api.post<PutInstanceResponse>(
      `${base(companyId, agentId)}/instances`,
      body,
    ),

  deleteInstance: (companyId: string, agentId: string, instanceId: string) =>
    api.delete<DeleteInstanceResponse>(
      `${base(companyId, agentId)}/instances/${encodeURIComponent(instanceId)}`,
    ),

  sync: (companyId: string, agentId: string) =>
    api.post<SyncRuntimeResponse>(`${base(companyId, agentId)}/sync`, {}),

  operation: (companyId: string, agentId: string, opId: string) =>
    api.get<BrokerOperationDTO>(
      `${base(companyId, agentId)}/operations/${encodeURIComponent(opId)}`,
    ),
};
