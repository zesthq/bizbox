import { beforeEach, describe, expect, it, vi } from "vitest";

const mockApi = vi.hoisted(() => ({
  get: vi.fn(),
}));

vi.mock("./client", () => ({
  api: mockApi,
}));

import { deliverablesApi } from "./deliverables";

describe("deliverablesApi", () => {
  beforeEach(() => {
    mockApi.get.mockReset();
  });

  it("list builds company deliverables query", async () => {
    mockApi.get.mockResolvedValue({ items: [], limit: 50, offset: 0 });

    await deliverablesApi.list("company-1", {
      projectId: "project-1",
      agentId: "agent-1",
      q: "report",
      audience: "internal",
      limit: 20,
      offset: 40,
    });

    expect(mockApi.get).toHaveBeenCalledWith(
      "/companies/company-1/deliverables?limit=20&offset=40&projectId=project-1&agentId=agent-1&q=report&audience=internal",
    );
  });

  it("listAll delegates to single bounded list request", async () => {
    mockApi.get.mockResolvedValue({ items: [{ id: "d1" }], limit: 200, offset: 0 });

    const res = await deliverablesApi.listAll("company-1");

    expect(mockApi.get).toHaveBeenCalledTimes(1);
    expect(mockApi.get).toHaveBeenCalledWith(
      "/companies/company-1/deliverables?limit=200",
    );
    expect(res.items).toEqual([{ id: "d1" }]);
  });
});
