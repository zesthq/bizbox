import { afterEach, describe, expect, it, vi } from "vitest";

import { ghFetch } from "../services/github-fetch.js";

describe("ghFetch", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("forwards auth to allowed GitHub hosts", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response("ok"));
    vi.stubGlobal("fetch", fetchMock);

    await ghFetch("https://api.github.com/repos/acme/private", undefined, { token: "ghp_test" });

    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.github.com/repos/acme/private",
      expect.objectContaining({
        headers: expect.any(Headers),
      }),
    );
    expect(new Headers(fetchMock.mock.calls[0]?.[1]?.headers).get("authorization")).toBe("Bearer ghp_test");
  });

  it("rejects forwarding auth to non-GitHub hosts", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      ghFetch("https://example.com/private", undefined, { token: "ghp_test" }),
    ).rejects.toThrow("Refusing to forward GitHub auth to non-GitHub URL");

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rejects forwarding auth to localhost", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      ghFetch("https://localhost/private", undefined, { token: "ghp_test" }),
    ).rejects.toThrow("Refusing to forward GitHub auth to non-GitHub URL");

    expect(fetchMock).not.toHaveBeenCalled();
  });
});
