import type {
  CompanyGitHubCredentialAssociation,
  CompanySkill,
  CompanySkillCreateRequest,
  CompanySkillDetail,
  CompanySkillFileDetail,
  CompanySkillImportRequest,
  CompanySkillImportResult,
  CompanySkillListItem,
  CompanySkillProjectScanRequest,
  CompanySkillProjectScanResult,
  CompanySkillUpdateStatus,
  UpsertCompanyGitHubCredentialAssociationRequest,
} from "@paperclipai/shared";
import { api } from "./client";

export const companySkillsApi = {
  list: (companyId: string) =>
    api.get<CompanySkillListItem[]>(`/companies/${encodeURIComponent(companyId)}/skills`),
  detail: (companyId: string, skillId: string) =>
    api.get<CompanySkillDetail>(
      `/companies/${encodeURIComponent(companyId)}/skills/${encodeURIComponent(skillId)}`,
    ),
  updateStatus: (companyId: string, skillId: string) =>
    api.get<CompanySkillUpdateStatus>(
      `/companies/${encodeURIComponent(companyId)}/skills/${encodeURIComponent(skillId)}/update-status`,
    ),
  file: (companyId: string, skillId: string, relativePath: string) =>
    api.get<CompanySkillFileDetail>(
      `/companies/${encodeURIComponent(companyId)}/skills/${encodeURIComponent(skillId)}/files?path=${encodeURIComponent(relativePath)}`,
    ),
  updateFile: (companyId: string, skillId: string, path: string, content: string) =>
    api.patch<CompanySkillFileDetail>(
      `/companies/${encodeURIComponent(companyId)}/skills/${encodeURIComponent(skillId)}/files`,
      { path, content },
    ),
  create: (companyId: string, payload: CompanySkillCreateRequest) =>
    api.post<CompanySkill>(
      `/companies/${encodeURIComponent(companyId)}/skills`,
      payload,
    ),
  importFromSource: (companyId: string, payload: CompanySkillImportRequest) =>
    api.post<CompanySkillImportResult>(
      `/companies/${encodeURIComponent(companyId)}/skills/import`,
      payload,
    ),
  githubCredentials: (companyId: string, filter?: { hostname?: string; owner?: string }) => {
    const params = new URLSearchParams();
    if (filter?.hostname) params.set("hostname", filter.hostname);
    if (filter?.owner) params.set("owner", filter.owner);
    const suffix = params.toString();
    return api.get<CompanyGitHubCredentialAssociation[]>(
      `/companies/${encodeURIComponent(companyId)}/skills/github-credentials${suffix ? `?${suffix}` : ""}`,
    );
  },
  upsertGitHubCredential: (companyId: string, payload: UpsertCompanyGitHubCredentialAssociationRequest) =>
    api.put<CompanyGitHubCredentialAssociation>(
      `/companies/${encodeURIComponent(companyId)}/skills/github-credentials`,
      payload,
    ),
  scanProjects: (companyId: string, payload: CompanySkillProjectScanRequest = {}) =>
    api.post<CompanySkillProjectScanResult>(
      `/companies/${encodeURIComponent(companyId)}/skills/scan-projects`,
      payload,
    ),
  installUpdate: (companyId: string, skillId: string) =>
    api.post<CompanySkill>(
      `/companies/${encodeURIComponent(companyId)}/skills/${encodeURIComponent(skillId)}/install-update`,
      {},
    ),
  delete: (companyId: string, skillId: string) =>
    api.delete<CompanySkill>(
      `/companies/${encodeURIComponent(companyId)}/skills/${encodeURIComponent(skillId)}`,
    ),
};
