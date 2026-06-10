import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { analyzeWorkflowProject, prepareInstrumentedWorkflowRuntime } from "../services/workflows-runtime.js";

describe("workflows runtime analysis", () => {
  const tempRoots: string[] = [];

  afterEach(async () => {
    await Promise.all(tempRoots.splice(0).map((root) => fs.rm(root, { recursive: true, force: true })));
  });

  it("ignores closing delimiters inside Python line comments", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "paperclip-workflow-runtime-"));
    tempRoots.push(root);
    const agentPath = path.join(root, "agent.py");
    await fs.writeFile(agentPath, `
from google.adk.agents import Agent

def build_outline():
    return "outline"

reviewer = Agent(
    name="Reviewer",
)

root = Agent(
    name="Root",
    # a comment with a closing paren should not end the constructor )
    sub_agents=[reviewer],
    tools=[build_outline],
)

root_agent = root
`, "utf8");

    const analysis = await analyzeWorkflowProject(agentPath);
    expect(analysis.pipelineDefinition.phases.map((phase) => phase.label)).toContain("Reviewer");
    expect(analysis.pipelineDefinition.phases.map((phase) => phase.label)).toContain("build_outline");
  });

  it("makes workflow temp runtime traversable to sandboxed subprocesses", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "paperclip-workflow-runtime-"));
    tempRoots.push(root);

    const agentDir = path.join(root, "agent");
    const skillDir = path.join(agentDir, "skills", "clickup-social-signals");
    await fs.mkdir(skillDir, { recursive: true });
    await fs.writeFile(path.join(skillDir, "SKILL.md"), "# ClickUp Social Signals\n", "utf8");
    await fs.writeFile(path.join(agentDir, "agent.py"), "root_agent = None\n", "utf8");

    const prepared = await prepareInstrumentedWorkflowRuntime({
      workflowId: "workflow-1",
      runId: "run-1",
      companyId: "company-1",
      runToken: "token-1",
      runnerConfig: {
        agentPath: agentDir,
        cwd: agentDir,
      },
      analysis: {
        sourceHash: "hash-1",
        entrypoint: "agent/agent.py",
        pipelineDefinition: {
          entrypoint: "agent/agent.py",
          generatedAt: new Date(0).toISOString(),
          phases: [],
        },
        files: [],
        rootDir: root,
        entryPath: path.join(agentDir, "agent.py"),
        executionTargetPath: agentDir,
      },
    });
    tempRoots.push(prepared.tempRoot);

    const tempRootMode = (await fs.stat(prepared.tempRoot)).mode & 0o777;
    const helperMode = (await fs.stat(path.join(prepared.tempRoot, "sitecustomize.py"))).mode & 0o777;
    const copiedSkillDirMode = (await fs.stat(path.join(prepared.tempRoot, "project", "agent", "skills", "clickup-social-signals"))).mode & 0o777;
    const copiedSkillFileMode = (await fs.stat(path.join(prepared.tempRoot, "project", "agent", "skills", "clickup-social-signals", "SKILL.md"))).mode & 0o777;

    expect(tempRootMode).toBe(0o755);
    expect(helperMode).toBe(0o644);
    expect(copiedSkillDirMode).toBe(0o755);
    expect(copiedSkillFileMode).toBe(0o644);
  });
});
