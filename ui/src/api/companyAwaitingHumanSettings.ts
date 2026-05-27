import type { CompanyAwaitingHumanSettings, UpdateCompanyAwaitingHumanSettingsRequest } from "@paperclipai/shared";
import { api } from "./client";

export interface AwaitingHumanConnectionTestResult {
  status: "sent" | "skipped" | "failed" | "enqueued";
  channel: "clickup-chat";
  detail: string;
  externalId?: string | null;
}

export const companyAwaitingHumanSettingsApi = {
  get: (companyId: string) =>
    api.get<CompanyAwaitingHumanSettings>(`/companies/${companyId}/awaiting-human-settings`),
  update: (companyId: string, data: UpdateCompanyAwaitingHumanSettingsRequest) =>
    api.patch<CompanyAwaitingHumanSettings>(`/companies/${companyId}/awaiting-human-settings`, data),
  testConnection: (companyId: string, data: UpdateCompanyAwaitingHumanSettingsRequest) =>
    api.post<AwaitingHumanConnectionTestResult>(`/companies/${companyId}/awaiting-human-settings/connection-test`, data),
};
