import { api } from "./client";

export interface EmergencyStopStatus {
  totalActive: number;
  runningCount: number;
  queuedCount: number;
  companyCount: number;
  agentCount: number;
}

export interface EmergencyStopResult {
  status: string;
  cancelledCount: number;
  totalAttempted: number;
  errors?: Array<{ runId: string; error: string }>;
  message: string;
}

export const emergencyStopApi = {
  getStatus: () =>
    api.get<EmergencyStopStatus>("/instance/emergency-stop/status"),

  stopAllRuns: () =>
    api.post<EmergencyStopResult>("/instance/emergency-stop/runs", {}),

  shutdownServer: () =>
    api.post<EmergencyStopResult>("/instance/emergency-stop/server", {}),
};
