/**
 * Emergency Stop routes — instance-admin-only endpoints to cancel all running
 * agent processes across every company, or fully shut down the server.
 *
 * Two modes:
 *   POST /instance/emergency-stop/runs   — Cancel all active runs but keep server alive
 *   POST /instance/emergency-stop/server — Cancel all runs then shut down the server process
 */

import { Router } from "express";
import type { Db } from "@paperclipai/db";
import { heartbeatRuns, companies } from "@paperclipai/db";
import { inArray } from "drizzle-orm";
import { assertInstanceAdmin, getActorInfo } from "./authz.js";
import { heartbeatService, logActivity } from "../services/index.js";
import { logger } from "../middleware/logger.js";

export function emergencyStopRoutes(db: Db) {
  const router = Router();

  /**
   * POST /instance/emergency-stop/runs
   *
   * Cancels every queued and running heartbeat run across all companies.
   * The server remains alive and operational after this call.
   */
  router.post("/instance/emergency-stop/runs", async (req, res) => {
    assertInstanceAdmin(req);
    const actor = getActorInfo(req);
    const heartbeat = heartbeatService(db);

    // Find all active runs across all companies
    const activeRuns = await db
      .select({ id: heartbeatRuns.id, companyId: heartbeatRuns.companyId, agentId: heartbeatRuns.agentId })
      .from(heartbeatRuns)
      .where(inArray(heartbeatRuns.status, ["queued", "running"]));

    if (activeRuns.length === 0) {
      res.json({
        status: "ok",
        cancelledCount: 0,
        totalAttempted: 0,
        errors: undefined,
        message: "No active runs to cancel.",
      });
      return;
    }

    let cancelledCount = 0;
    const errors: Array<{ runId: string; error: string }> = [];

    const results = await Promise.allSettled(
      activeRuns.map((run) => heartbeat.cancelRun(run.id))
    );

    results.forEach((result, i) => {
      if (result.status === "fulfilled") {
        cancelledCount++;
      } else {
        const run = activeRuns[i]!;
        const err = result.reason;
        const message = err instanceof Error ? err.message : String(err);
        errors.push({ runId: run.id, error: message });
        logger.error({ runId: run.id, err: message }, "emergency-stop: failed to cancel run");
      }
    });

    // Log the emergency stop action to all affected companies
    const affectedCompanyIds = [...new Set(activeRuns.map((r) => r.companyId))];
    await Promise.allSettled(
      affectedCompanyIds.map((companyId) =>
        logActivity(db, {
          companyId,
          actorType: actor.actorType,
          actorId: actor.actorId,
          agentId: actor.agentId,
          runId: actor.runId,
          action: "instance.emergency_stop.runs",
          entityType: "instance_settings",
          entityId: "emergency-stop",
          details: {
            cancelledCount,
            totalAttempted: activeRuns.length,
            errorCount: errors.length,
          },
        }).catch((logErr) => {
          logger.error({ err: logErr }, "emergency-stop: failed to log activity");
        }),
      ),
    );

    logger.warn(
      { cancelledCount, errorCount: errors.length, totalAttempted: activeRuns.length },
      "emergency-stop: cancelled all active runs",
    );

    res.json({
      status: "ok",
      cancelledCount,
      totalAttempted: activeRuns.length,
      errors: errors.length > 0 ? errors : undefined,
      message: `Cancelled ${cancelledCount} of ${activeRuns.length} active runs.`,
    });
  });

  /**
   * POST /instance/emergency-stop/server
   *
   * Cancels all active runs then shuts down the server process.
   * The HTTP response is sent BEFORE the process exits.
   */
  router.post("/instance/emergency-stop/server", async (req, res) => {
    assertInstanceAdmin(req);
    
    if (req.body?.confirm !== "SHUTDOWN") {
      res.status(400).json({ error: "Explicit 'SHUTDOWN' confirmation required." });
      return;
    }

    const actor = getActorInfo(req);
    const heartbeat = heartbeatService(db);

    const activeRuns = await db
      .select({ id: heartbeatRuns.id, companyId: heartbeatRuns.companyId })
      .from(heartbeatRuns)
      .where(inArray(heartbeatRuns.status, ["queued", "running"]));

    let cancelledCount = 0;
    
    const results = await Promise.allSettled(
      activeRuns.map((run) => heartbeat.cancelRun(run.id))
    );

    results.forEach((result, i) => {
      if (result.status === "fulfilled") {
        cancelledCount++;
      } else {
        const run = activeRuns[i]!;
        const err = result.reason;
        logger.error(
          { runId: run.id, err: err instanceof Error ? err.message : String(err) },
          "emergency-stop-server: failed to cancel run",
        );
      }
    });

    // Log to all companies before exiting
    const allCompanies = await db.select({ id: companies.id }).from(companies);
    const affectedCompanyIds = allCompanies.map((c) => c.id);
    await Promise.allSettled(
      affectedCompanyIds.map((companyId) =>
        logActivity(db, {
          companyId,
          actorType: actor.actorType,
          actorId: actor.actorId,
          agentId: actor.agentId,
          runId: actor.runId,
          action: "instance.emergency_stop.server",
          entityType: "instance_settings",
          entityId: "emergency-stop",
          details: { cancelledCount, totalAttempted: activeRuns.length },
        }).catch(() => {}),
      ),
    );

    logger.warn(
      { cancelledCount, totalAttempted: activeRuns.length },
      "emergency-stop-server: shutting down server process",
    );

    // Respond BEFORE exiting so the client knows the command was received
    res.json({
      status: "shutting_down",
      cancelledCount,
      totalAttempted: activeRuns.length,
      message: `Cancelled ${cancelledCount} runs. Server is shutting down.`,
    });

    // Defer the exit so the response flushes
    setTimeout(() => {
      process.kill(process.pid, "SIGTERM");
    }, 500);
  });

  /**
   * GET /instance/emergency-stop/status
   *
   * Returns the count of currently active runs across all companies.
   * Used by the UI to show live state on the emergency stop panel.
   */
  router.get("/instance/emergency-stop/status", async (req, res) => {
    assertInstanceAdmin(req);

    const activeRuns = await db
      .select({
        id: heartbeatRuns.id,
        status: heartbeatRuns.status,
        companyId: heartbeatRuns.companyId,
        agentId: heartbeatRuns.agentId,
      })
      .from(heartbeatRuns)
      .where(inArray(heartbeatRuns.status, ["queued", "running"]));

    const runningCount = activeRuns.filter((r) => r.status === "running").length;
    const queuedCount = activeRuns.filter((r) => r.status === "queued").length;

    res.json({
      totalActive: activeRuns.length,
      runningCount,
      queuedCount,
      companyCount: new Set(activeRuns.map((r) => r.companyId)).size,
      agentCount: new Set(activeRuns.map((r) => r.agentId)).size,
    });
  });

  return router;
}
