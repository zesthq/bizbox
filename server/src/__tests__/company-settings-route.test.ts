import express from "express";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mockCompanyService = vi.hoisted(() => ({
  getById: vi.fn(),
}));

const mockAwaitingHumanSettingsService = vi.hoisted(() => ({
  get: vi.fn(),
  update: vi.fn(),
}));

const mockAccessService = vi.hoisted(() => ({
  ensureMembership: vi.fn(),
}));

const mockAgentService = vi.hoisted(() => ({
  getById: vi.fn(),
}));

const mockBudgetService = vi.hoisted(() => ({
  upsertPolicy: vi.fn(),
}));

const mockCompanyPortabilityService = vi.hoisted(() => ({
  exportBundle: vi.fn(),
  previewExport: vi.fn(),
  previewImport: vi.fn(),
  importBundle: vi.fn(),
}));

const mockFeedbackService = vi.hoisted(() => ({
  listIssueVotesForUser: vi.fn(),
  listFeedbackTraces: vi.fn(),
  getFeedbackTraceById: vi.fn(),
  saveIssueVote: vi.fn(),
}));

const mockLogActivity = vi.hoisted(() => vi.fn());

vi.mock("../services/index.js", () => ({
  accessService: () => mockAccessService,
  agentService: () => mockAgentService,
  awaitingHumanSettingsService: () => mockAwaitingHumanSettingsService,
  budgetService: () => mockBudgetService,
  companyPortabilityService: () => mockCompanyPortabilityService,
  companyService: () => mockCompanyService,
  feedbackService: () => mockFeedbackService,
  logActivity: mockLogActivity,
}));

function createCompany() {
  const now = new Date("2026-05-22T02:00:00.000Z");
  return {
    id: "company-1",
    name: "Paperclip",
    description: null,
    status: "active",
    issuePrefix: "PAP",
    issueCounter: 568,
    budgetMonthlyCents: 0,
    spentMonthlyCents: 0,
    requireBoardApprovalForNewAgents: false,
    feedbackDataSharingEnabled: false,
    feedbackDataSharingConsentAt: null,
    feedbackDataSharingConsentByUserId: null,
    feedbackDataSharingTermsVersion: null,
    brandColor: "#123456",
    logoAssetId: "11111111-1111-4111-8111-111111111111",
    logoUrl: "/api/assets/11111111-1111-4111-8111-111111111111/content",
    createdAt: now,
    updatedAt: now,
  };
}

function createSettings() {
  const now = new Date("2026-05-22T02:00:00.000Z");
  return {
    companyId: "company-1",
    enabled: true,
    provider: "clickup" as const,
    providerConfig: {
      workspaceId: "90161423646",
      channelId: "channel-123",
    },
    hasStoredAuthToken: true,
    createdAt: now,
    updatedAt: now,
  };
}

async function createApp(actor: Record<string, unknown>) {
  const [{ companyRoutes }, { errorHandler }] = await Promise.all([
    vi.importActual<typeof import("../routes/companies.js")>("../routes/companies.js"),
    vi.importActual<typeof import("../middleware/index.js")>("../middleware/index.js"),
  ]);
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    (req as any).actor = actor;
    next();
  });
  app.use("/api/companies", companyRoutes({} as any));
  app.use(errorHandler);
  return app;
}

describe("company awaiting-human settings route", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.doUnmock("../routes/companies.js");
    vi.doUnmock("../routes/authz.js");
    vi.doUnmock("../middleware/index.js");
    vi.resetAllMocks();
  });

  it("returns company awaiting-human settings through the dedicated route", async () => {
    mockCompanyService.getById.mockResolvedValue(createCompany());
    mockAwaitingHumanSettingsService.get.mockResolvedValue(createSettings());

    const app = await createApp({
      type: "board",
      userId: "user-1",
      source: "local_implicit",
    });

    const res = await request(app).get("/api/companies/company-1/awaiting-human-settings");

    expect(res.status).toBe(200);
    expect(mockAwaitingHumanSettingsService.get).toHaveBeenCalledWith("company-1");
    expect(res.body.providerConfig.workspaceId).toBe("90161423646");
  });

  it("updates company awaiting-human settings through the dedicated route", async () => {
    const settings = createSettings();
    mockCompanyService.getById.mockResolvedValue(createCompany());
    mockAwaitingHumanSettingsService.update.mockResolvedValue(settings);

    const app = await createApp({
      type: "board",
      userId: "user-1",
      source: "local_implicit",
    });

    const res = await request(app)
      .patch("/api/companies/company-1/awaiting-human-settings")
      .send({
        enabled: true,
        provider: "clickup",
        providerConfig: {
          workspaceId: "90161423646",
          channelId: "channel-123",
        },
        clickupPersonalToken: "token-123",
      });

    expect(res.status).toBe(200);
    expect(mockAwaitingHumanSettingsService.update).toHaveBeenCalledWith(
      "company-1",
      {
        enabled: true,
        provider: "clickup",
        providerConfig: {
          workspaceId: "90161423646",
          channelId: "channel-123",
        },
        clickupPersonalToken: "token-123",
      },
      {
        userId: "user-1",
        agentId: null,
      },
    );
    expect(mockLogActivity).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        companyId: "company-1",
        action: "company.awaiting_human_settings.updated",
      }),
    );
    expect(res.body.provider).toBe("clickup");
  });
});
