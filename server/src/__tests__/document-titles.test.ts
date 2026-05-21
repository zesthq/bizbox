import { describe, expect, it } from "vitest";
import { extractMarkdownH1, resolveDocumentTitle } from "../lib/document-titles.js";

describe("extractMarkdownH1", () => {
  it("strips inline markdown syntax from the inferred H1 title", () => {
    expect(extractMarkdownH1("# **Quarterly Closeout** [Status Update](https://example.com)")).toBe(
      "Quarterly Closeout Status Update",
    );
  });

  it("ignores headings indented as code blocks", () => {
    expect(extractMarkdownH1("    # Not A Heading\n# Actual Heading")).toBe("Actual Heading");
  });
});

describe("resolveDocumentTitle", () => {
  it("falls back to a sanitized markdown H1 when the stored title is null", () => {
    expect(resolveDocumentTitle(null, "markdown", "# `Sprint Summary`")).toBe("Sprint Summary");
  });
});
