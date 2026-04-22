import express from "express";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mockHeartbeatService = vi.hoisted(() => ({
  cancelRun: vi.fn(),
}));

const mockLogActivity = vi.hoisted(() => vi.fn());

vi.mock("../services/index.js", () => ({
  heartbeatService: () => mockHeartbeatService,
  logActivity: mockLogActivity,
}));

// Mock db chain
const mockQueryBuilder = {
  from: vi.fn().mockReturnThis(),
  where: vi.fn().mockResolvedValue([]),
  then: function(resolve: any) {
    resolve([]);
  }
};

const mockDb = {
  select: vi.fn().mockReturnValue(mockQueryBuilder),
};

async function createApp(actor: any) {
  const [{ errorHandler }, { emergencyStopRoutes }] = await Promise.all([
    vi.importActual<typeof import("../middleware/index.js")>("../middleware/index.js"),
    vi.importActual<typeof import("../routes/emergency-stop.js")>("../routes/emergency-stop.js"),
  ]);
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    (req as any).actor = actor;
    next();
  });
  app.use("/api", emergencyStopRoutes(mockDb as any));
  app.use(errorHandler);
  return app;
}

describe("emergency stop routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("authz", () => {
    it("rejects non-admin board users with 403", async () => {
      const app = await createApp({
        type: "board",
        userId: "user-1",
        source: "session",
        isInstanceAdmin: false,
      });

      const res = await request(app).get("/api/instance/emergency-stop/status");
      expect(res.status).toBe(403);
    });

    it("rejects agent actors with 403", async () => {
      const app = await createApp({
        type: "agent",
        agentId: "agent-1",
        companyId: "company-1",
        source: "agent_key",
      });

      const res = await request(app).post("/api/instance/emergency-stop/runs");
      expect(res.status).toBe(403);
    });
  });

  describe("GET /instance/emergency-stop/status", () => {
    it("returns active run counts", async () => {
      // Mock db returning some runs
      const localMockQueryBuilder = {
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockResolvedValue([
          { id: "run-1", status: "running", companyId: "c1", agentId: "a1" },
          { id: "run-2", status: "queued", companyId: "c2", agentId: "a2" },
        ]),
        then: function(resolve: any) {
          resolve([]);
        }
      };
      mockDb.select.mockReturnValueOnce(localMockQueryBuilder as any);

      const app = await createApp({
        type: "board",
        userId: "admin-1",
        source: "session",
        isInstanceAdmin: true,
      });

      const res = await request(app).get("/api/instance/emergency-stop/status");
      expect(res.status).toBe(200);
      expect(res.body).toEqual({
        totalActive: 2,
        runningCount: 1,
        queuedCount: 1,
        companyCount: 2,
        agentCount: 2,
      });
    });
  });

  describe("POST /instance/emergency-stop/runs", () => {
    it("returns 200 and cancels active runs", async () => {
      const localMockQueryBuilder = {
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockResolvedValue([
          { id: "run-1", status: "running", companyId: "c1", agentId: "a1" },
        ]),
        then: function(resolve: any) {
          resolve([]);
        }
      };
      mockDb.select.mockReturnValueOnce(localMockQueryBuilder as any);

      const app = await createApp({
        type: "board",
        userId: "admin-1",
        source: "session",
        isInstanceAdmin: true,
      });

      const res = await request(app).post("/api/instance/emergency-stop/runs");
      
      expect(res.status).toBe(200);
      expect(res.body).toEqual({
        status: "ok",
        cancelledCount: 1,
        totalAttempted: 1,
        message: "Cancelled 1 of 1 active runs.",
      });
      // errors should be undefined
      expect(res.body.errors).toBeUndefined();

      expect(mockHeartbeatService.cancelRun).toHaveBeenCalledWith("run-1");
      expect(mockLogActivity).toHaveBeenCalled();
    });
  });

  describe("POST /instance/emergency-stop/server", () => {
    it("fails with 400 if confirmation string is missing", async () => {
      const app = await createApp({
        type: "board",
        userId: "admin-1",
        source: "session",
        isInstanceAdmin: true,
      });

      const res = await request(app).post("/api/instance/emergency-stop/server").send({});
      
      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/Explicit 'SHUTDOWN' confirmation required/);
    });

    it("fails with 400 if confirmation string is incorrect", async () => {
      const app = await createApp({
        type: "board",
        userId: "admin-1",
        source: "session",
        isInstanceAdmin: true,
      });

      const res = await request(app).post("/api/instance/emergency-stop/server").send({ confirm: "yes" });
      
      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/Explicit 'SHUTDOWN' confirmation required/);
    });

    it("succeeds and initiates shutdown with valid confirmation", async () => {
      // Mock db first returning active runs, then all companies
      const localMockQueryBuilderRuns = {
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockResolvedValue([
          { id: "run-1", companyId: "c1" },
        ]),
        then: function(resolve: any) { resolve([]); }
      };
      const localMockQueryBuilderCompanies = {
        from: vi.fn().mockResolvedValue([{ id: "c1" }]),
        where: vi.fn().mockReturnThis(),
        then: function(resolve: any) { resolve([]); }
      };

      mockDb.select
        .mockReturnValueOnce(localMockQueryBuilderRuns as any)
        .mockReturnValueOnce(localMockQueryBuilderCompanies as any);

      // We should mock process.kill to avert actual test process death
      const killSpy = vi.spyOn(process, "kill").mockImplementation(() => true);

      const app = await createApp({
        type: "board",
        userId: "admin-1",
        source: "session",
        isInstanceAdmin: true,
      });

      const res = await request(app)
        .post("/api/instance/emergency-stop/server")
        .send({ confirm: "SHUTDOWN" });
      
      expect(res.status).toBe(200);
      expect(res.body).toEqual({
        status: "shutting_down",
        cancelledCount: 1,
        totalAttempted: 1,
        message: "Cancelled 1 runs. Server is shutting down.",
      });

      expect(mockHeartbeatService.cancelRun).toHaveBeenCalledWith("run-1");
      expect(mockLogActivity).toHaveBeenCalled();
      
      // Cleanup
      killSpy.mockRestore();
    });
  });
});
