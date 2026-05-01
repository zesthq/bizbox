import { Router } from "express";
import type { Db } from "@paperclipai/db";
import {
  agentRuntimeKindSchema,
  listRuntimeInstancesQuerySchema,
  putRuntimeInstanceSchema,
} from "@paperclipai/shared";
import { validate } from "../middleware/validate.js";
import {
  agentRuntimeService,
  BrokerNotSupportedError,
} from "../services/agent-runtime.js";
import { assertCompanyAccess, getActorInfo } from "./authz.js";
import { forbidden, unprocessable } from "../errors.js";

/**
 * Routes for the Agent Runtime Broker (OSBAPI-shaped) per host agent.
 * All endpoints are mounted under /api/companies/:companyId/runtimes/:agentId.
 */
export function agentRuntimeRoutes(db: Db) {
  const router = Router();
  const svc = agentRuntimeService(db);

  /**
   * Board users get full access; agent tokens are restricted to their own
   * company and their own agent record (mirrors the OpenClaw invite endpoint).
   */
  function assertCanUseBroker(
    req: Parameters<typeof assertCompanyAccess>[0],
    companyId: string,
    hostAgentId: string,
  ) {
    assertCompanyAccess(req, companyId);
    if (req.actor.type === "agent") {
      const callerAgent = req.actor.agentId;
      if (!callerAgent || callerAgent !== hostAgentId) {
        throw forbidden("Agent token can only manage its own runtime");
      }
    }
  }

  router.get(
    "/companies/:companyId/runtimes/:agentId/catalog",
    async (req, res) => {
      const { companyId, agentId } = req.params as {
        companyId: string;
        agentId: string;
      };
      assertCanUseBroker(req, companyId, agentId);
      const force = String(req.query.force ?? "") === "1";
      try {
        const catalog = await svc.getCatalog(companyId, agentId, { force });
        res.json(catalog);
      } catch (err) {
        if (err instanceof BrokerNotSupportedError) {
          throw unprocessable(err.message);
        }
        throw err;
      }
    },
  );

  router.get(
    "/companies/:companyId/runtimes/:agentId/describe",
    async (req, res) => {
      const { companyId, agentId } = req.params as {
        companyId: string;
        agentId: string;
      };
      assertCanUseBroker(req, companyId, agentId);
      const descriptor = await svc.describe(companyId, agentId);
      res.json(descriptor);
    },
  );

  router.get(
    "/companies/:companyId/runtimes/:agentId/instances",
    async (req, res) => {
      const { companyId, agentId } = req.params as {
        companyId: string;
        agentId: string;
      };
      assertCanUseBroker(req, companyId, agentId);
      const parsed = listRuntimeInstancesQuerySchema.safeParse(req.query);
      if (!parsed.success) {
        throw unprocessable("Invalid query", parsed.error.flatten());
      }
      const instances = await svc.listInstances(companyId, agentId, {
        kind: parsed.data.kind,
      });
      res.json({ instances });
    },
  );

  router.put(
    "/companies/:companyId/runtimes/:agentId/instances/:instanceId",
    validate(putRuntimeInstanceSchema),
    async (req, res) => {
      const { companyId, agentId, instanceId } = req.params as {
        companyId: string;
        agentId: string;
        instanceId: string;
      };
      assertCanUseBroker(req, companyId, agentId);
      const body = req.body as Record<string, unknown>;
      try {
        const result = await svc.putInstance({
          companyId,
          hostAgentId: agentId,
          instanceId,
          kind: body.kind as never,
          plan: (body.plan as string | null | undefined) ?? null,
          desiredConfig:
            (body.desiredConfig as Record<string, unknown> | undefined) ?? {},
          secretRefs: body.secretRefs as
            | Array<{ key: string; ref: string }>
            | undefined,
          actor: getActorInfo(req),
          idempotencyKey: body.idempotencyKey as string | undefined,
        });
        res.json(result);
      } catch (err) {
        if (err instanceof BrokerNotSupportedError) {
          throw unprocessable(err.message);
        }
        throw err;
      }
    },
  );

  router.post(
    "/companies/:companyId/runtimes/:agentId/instances",
    validate(putRuntimeInstanceSchema),
    async (req, res) => {
      const { companyId, agentId } = req.params as {
        companyId: string;
        agentId: string;
      };
      assertCanUseBroker(req, companyId, agentId);
      const body = req.body as Record<string, unknown>;
      try {
        const result = await svc.putInstance({
          companyId,
          hostAgentId: agentId,
          kind: body.kind as never,
          plan: (body.plan as string | null | undefined) ?? null,
          desiredConfig:
            (body.desiredConfig as Record<string, unknown> | undefined) ?? {},
          secretRefs: body.secretRefs as
            | Array<{ key: string; ref: string }>
            | undefined,
          actor: getActorInfo(req),
          idempotencyKey: body.idempotencyKey as string | undefined,
        });
        res.status(201).json(result);
      } catch (err) {
        if (err instanceof BrokerNotSupportedError) {
          throw unprocessable(err.message);
        }
        throw err;
      }
    },
  );

  router.delete(
    "/companies/:companyId/runtimes/:agentId/instances/:instanceId",
    async (req, res) => {
      const { companyId, agentId, instanceId } = req.params as {
        companyId: string;
        agentId: string;
        instanceId: string;
      };
      assertCanUseBroker(req, companyId, agentId);
      const result = await svc.deleteInstance({
        companyId,
        hostAgentId: agentId,
        instanceId,
        actor: getActorInfo(req),
      });
      res.json(result);
    },
  );

  router.post(
    "/companies/:companyId/runtimes/:agentId/sync",
    async (req, res) => {
      const { companyId, agentId } = req.params as {
        companyId: string;
        agentId: string;
      };
      assertCanUseBroker(req, companyId, agentId);
      try {
        const result = await svc.syncNow({
          companyId,
          hostAgentId: agentId,
          actor: getActorInfo(req),
        });
        res.json(result);
      } catch (err) {
        if (err instanceof BrokerNotSupportedError) {
          throw unprocessable(err.message);
        }
        throw err;
      }
    },
  );

  router.get(
    "/companies/:companyId/runtimes/:agentId/operations/:operationId",
    async (req, res) => {
      const { companyId, agentId, operationId } = req.params as {
        companyId: string;
        agentId: string;
        operationId: string;
      };
      assertCanUseBroker(req, companyId, agentId);
      const op = await svc.getOperation(companyId, agentId, operationId);
      res.json(op);
    },
  );

  // Reference the kind schema so it isn't dropped by tree-shaking.
  void agentRuntimeKindSchema;

  return router;
}
