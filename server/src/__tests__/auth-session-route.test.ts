import express from "express";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";
const mockLoggerWarn = vi.hoisted(() => vi.fn());
vi.mock("../middleware/logger.js", () => ({
  logger: {
    warn: mockLoggerWarn,
  },
}));
import { actorMiddleware } from "../middleware/auth.js";
import { errorHandler } from "../middleware/error-handler.js";

function createSelectChain(rows: unknown[]) {
  return {
    from() {
      return {
        where() {
          return Promise.resolve(rows);
        },
      };
    },
  };
}

function createDb() {
  return {
    select: vi
      .fn()
      .mockImplementationOnce(() => createSelectChain([]))
      .mockImplementationOnce(() => createSelectChain([])),
  } as any;
}

describe("actorMiddleware authenticated session profile", () => {
  it("preserves the signed-in user name and email on the board actor", async () => {
    const app = express();
    app.use(
      actorMiddleware(createDb(), {
        deploymentMode: "authenticated",
        resolveSession: async () => ({
          session: { id: "session-1", userId: "user-1" },
          user: {
            id: "user-1",
            name: "User One",
            email: "user@example.com",
          },
        }),
      }),
    );
    app.get("/actor", (req, res) => {
      res.json(req.actor);
    });

    const res = await request(app).get("/actor");

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      type: "board",
      userId: "user-1",
      userName: "User One",
      userEmail: "user@example.com",
      source: "session",
      companyIds: [],
      memberships: [],
      isInstanceAdmin: false,
    });
  });

  it("returns an auth service error when session lookup fails", async () => {
    const error = new Error("Failed to get session");
    const app = express();
    app.use(
      actorMiddleware(createDb(), {
        deploymentMode: "authenticated",
        resolveSession: async () => {
          throw error;
        },
      }),
    );
    app.get("/actor", (_req, res) => {
      res.json({ ok: true });
    });
    app.use(errorHandler);

    const res = await request(app).get("/actor");

    expect(res.status).toBe(500);
    expect(res.body).toEqual({ error: "Authentication session lookup failed" });
    expect(mockLoggerWarn).toHaveBeenCalledWith(
      {
        err: error,
        method: "GET",
        url: "/actor",
      },
      "Failed to resolve auth session; aborting request",
    );
  });
});
