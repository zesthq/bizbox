import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { invokeGoogleAdk } from "./invoke.js";

describe("workflow ADK child credentials", () => {
  const originalKey = process.env.BIZBOX_API_KEY;
  const originalOther = process.env.BIZBOX_TEST_INHERITED;
  const roots: string[] = [];

  afterEach(async () => {
    if (originalKey === undefined) delete process.env.BIZBOX_API_KEY;
    else process.env.BIZBOX_API_KEY = originalKey;
    if (originalOther === undefined) delete process.env.BIZBOX_TEST_INHERITED;
    else process.env.BIZBOX_TEST_INHERITED = originalOther;
    await Promise.all(roots.splice(0).map((root) => fs.rm(root, { recursive: true, force: true })));
  });

  it("runs a shell entrypoint with only the delegated key while retaining other server env", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "bizbox-adk-credential-"));
    roots.push(root);
    const command = path.join(root, "run.sh");
    await fs.writeFile(command, "#!/bin/sh\nprintf '%s|%s\\n' \"${BIZBOX_API_KEY-unset}\" \"${BIZBOX_TEST_INHERITED-unset}\"\n");
    await fs.chmod(command, 0o755);
    process.env.BIZBOX_API_KEY = "inherited-key";
    process.env.BIZBOX_TEST_INHERITED = "other-server-value";
    const invoke = (authToken?: string) => invokeGoogleAdk({
      runId: "run-1",
      agent: { id: "workflow-1", companyId: "company-1", name: "Workflow", adapterType: "google_adk", adapterConfig: {} },
      config: { command, agentPath: root, env: { BIZBOX_API_KEY: "configured-resource-key" } },
      context: {}, onLog: async () => {}, queryOverride: "test", runtimeRootOverride: path.join(root, "runtime"),
      authToken,
    });
    const noRequester = await invoke();
    expect((noRequester.resultJson as { stdout: string }).stdout.trim()).toBe("unset|other-server-value");
    const delegated = await invoke("delegated-key");
    expect((delegated.resultJson as { stdout: string }).stdout.trim()).toBe("delegated-key|other-server-value");
  });
});
