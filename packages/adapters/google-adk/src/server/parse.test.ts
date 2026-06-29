import { describe, expect, it } from "vitest";
import { parseGoogleAdkJsonl } from "./parse.js";

describe("parseGoogleAdkJsonl", () => {
  it("keeps only the final model message as the summary", () => {
    const stdout = [
      JSON.stringify({
        content: {
          role: "model",
          parts: [{ text: '{"decision":"FREEFORM","user_request":"what is 1+1?"}' }],
        },
      }),
      JSON.stringify({
        content: {
          role: "model",
          parts: [{ text: "1 + 1 = **2**" }],
        },
      }),
    ].join("\n");

    const parsed = parseGoogleAdkJsonl(stdout);

    expect(parsed.summary).toBe("1 + 1 = **2**");
  });

  it("still captures tool calls, tool results, and usage", () => {
    const stdout = [
      JSON.stringify({
        content: {
          role: "model",
          parts: [{ functionCall: { name: "calculator", args: { a: 1, b: 1 } } }],
        },
      }),
      JSON.stringify({
        content: {
          role: "user",
          parts: [{ functionResponse: { name: "calculator", response: { result: 2 } } }],
        },
        usageMetadata: { inputTokens: 10, outputTokens: 4, cachedInputTokens: 2 },
      }),
      JSON.stringify({
        content: {
          role: "model",
          parts: [{ text: "done" }],
        },
      }),
    ].join("\n");

    const parsed = parseGoogleAdkJsonl(stdout);

    expect(parsed.summary).toBe("done");
    expect(parsed.toolCalls).toEqual([{ name: "calculator", input: { a: 1, b: 1 } }]);
    expect(parsed.toolResults).toEqual([{ name: "calculator", output: { result: 2 } }]);
    expect(parsed.usage).toEqual({ inputTokens: 10, outputTokens: 4, cachedInputTokens: 2 });
  });

  it("uses final workflow output as the summary when present", () => {
    const stdout = [
      JSON.stringify({
        content: {
          role: "model",
          parts: [{ text: '{"decision":"approve","feedback_text":""}' }],
        },
      }),
      JSON.stringify({
        author: "landing_page_strategist",
        node_path: "landing_page_strategist@1/landing_page_workspace_final_output@1",
        output:
          "## Final output\n\nFinal URL: https://citro-pages.fly.dev/dry-july-savings-challenge/",
      }),
    ].join("\n");

    const parsed = parseGoogleAdkJsonl(stdout);

    expect(parsed.summary).toContain("Final URL: https://citro-pages.fly.dev/dry-july-savings-challenge/");
  });
});
