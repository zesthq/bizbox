import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { analyzeWorkflowProject } from "../services/workflows-runtime.js";

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

  it("renders workflow DAG roots and joins for ADK workflows", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "paperclip-workflow-runtime-"));
    tempRoots.push(root);
    const agentPath = path.join(root, "agent.py");
    await fs.writeFile(agentPath, `
from google.adk.agents import Agent, JoinNode, Workflow

source_data_node = Agent(
    name="source_data",
)

write_article_1_node = Agent(
    name="write_article_1",
)

write_article_2_node = Agent(
    name="write_article_2",
)

recommend_recycled_articles_node = Agent(
    name="recommend_recycled_articles",
)

ugc_user_questions_node = Agent(
    name="ugc_user_questions",
)

article_output_collector = JoinNode(
    name="article_output_collector",
)

article_feedback_editor_node = Agent(
    name="article_feedback_editor",
)

recycled_article_accuracy_reviewer_node = Agent(
    name="recycled_article_accuracy_reviewer",
)

article_link_checker_node = Agent(
    name="article_link_checker",
)

review_output_router = Agent(
    name="review_output_router",
)

revise_output_node = Agent(
    name="revise_output",
)

workflow = Workflow(
    edges=[
        source_data_node >> write_article_1_node,
        source_data_node >> write_article_2_node,
        source_data_node >> recommend_recycled_articles_node,
        source_data_node >> ugc_user_questions_node,
        write_article_1_node >> article_output_collector,
        write_article_2_node >> article_output_collector,
        recommend_recycled_articles_node >> article_output_collector,
        ugc_user_questions_node >> article_output_collector,
        article_output_collector >> article_feedback_editor_node,
        article_feedback_editor_node >> recycled_article_accuracy_reviewer_node,
        recycled_article_accuracy_reviewer_node >> article_link_checker_node,
        article_link_checker_node >> review_output_router,
        review_output_router >> {"APPROVED": revise_output_node, "REWRITE": article_feedback_editor_node},
    ],
)

root_agent = workflow
`, "utf8");

    const analysis = await analyzeWorkflowProject(agentPath);
    const labels = analysis.pipelineDefinition.phases.map((phase) => phase.label);

    expect(labels).toEqual(
      expect.arrayContaining([
        "source_data",
        "write_article_1",
        "write_article_2",
        "recommend_recycled_articles",
        "ugc_user_questions",
        "article_output_collector",
        "article_feedback_editor",
        "recycled_article_accuracy_reviewer",
        "article_link_checker",
        "review_output_router",
        "revise_output",
      ]),
    );
    expect(analysis.pipelineDefinition.phases.some((phase) => phase.parentKey != null)).toBe(true);
  });
});
