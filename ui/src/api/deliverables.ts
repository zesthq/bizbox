import type { DeliverableAudience, DeliverableDetail, DeliverableListItem } from "@paperclipai/shared";
import { api } from "./client";

export interface DeliverableListResponse {
  items: DeliverableListItem[];
  limit: number;
  offset: number;
}

export interface DeliverableListFilters {
  limit?: number;
  offset?: number;
  projectId?: string;
  agentId?: string;
  q?: string;
  audience?: DeliverableAudience;
}

const DELIVERABLE_PAGE_LIMIT = 200;

function buildDeliverablesQuery(filters?: DeliverableListFilters) {
  const params = new URLSearchParams();
  if (filters?.limit) params.set("limit", String(filters.limit));
  if (filters?.offset) params.set("offset", String(filters.offset));
  if (filters?.projectId) params.set("projectId", filters.projectId);
  if (filters?.agentId) params.set("agentId", filters.agentId);
  if (filters?.q) params.set("q", filters.q);
  if (filters?.audience) params.set("audience", filters.audience);
  return params.toString();
}

async function listAllDeliverables(companyId: string, filters?: DeliverableListFilters) {
  const offset = Math.max(0, Math.floor(filters?.offset ?? 0));
  const limit = Math.max(1, Math.min(DELIVERABLE_PAGE_LIMIT, Math.floor(filters?.limit ?? DELIVERABLE_PAGE_LIMIT)));
  return deliverablesApi.list(companyId, {
    ...filters,
    limit,
    offset,
  });
}

export const deliverablesApi = {
  list: (companyId: string, filters?: DeliverableListFilters) => {
    const qs = buildDeliverablesQuery(filters);
    return api.get<DeliverableListResponse>(
      `/companies/${companyId}/deliverables${qs ? `?${qs}` : ""}`,
    );
  },
  listAll: listAllDeliverables,
  get: (id: string) => api.get<DeliverableDetail>(`/deliverables/${id}`),
};
