import { describe, expect, it } from "vitest";
import {
  createIssueWorkProductSchema,
  getIssueArtifactWorkProductValidationIssues,
  updateIssueWorkProductSchema,
} from "./work-product.js";

const validArtifactMetadata = {
  attachmentId: "11111111-1111-4111-8111-111111111111",
  contentPath: "/api/attachments/11111111-1111-4111-8111-111111111111/content",
  sourcePath: "deliverables/final-packet.md",
  contentType: "text/markdown",
  byteSize: 128,
  originalFilename: "final-packet.md",
};

describe("work product validators", () => {
  it("rejects artifact creation without attachment-backed metadata", () => {
    const parsed = createIssueWorkProductSchema.safeParse({
      type: "artifact",
      provider: "paperclip",
      title: "Final packet",
      status: "ready_for_review",
      metadata: null,
      createdByRunId: null,
    });

    expect(parsed.success).toBe(false);
    if (parsed.success) throw new Error("Expected artifact creation to fail validation");
    expect(parsed.error.issues.map((issue) => issue.path.join("."))).toEqual(
      expect.arrayContaining(["metadata", "createdByRunId"]),
    );
  });

  it("accepts artifact creation when metadata is attachment-backed and createdByRunId is present", () => {
    const parsed = createIssueWorkProductSchema.safeParse({
      type: "artifact",
      provider: "paperclip",
      title: "Final packet",
      url: validArtifactMetadata.contentPath,
      status: "ready_for_review",
      metadata: validArtifactMetadata,
      createdByRunId: "22222222-2222-4222-8222-222222222222",
    });

    expect(parsed.success).toBe(true);
  });

  it("rejects artifact metadata that points at a raw filesystem path", () => {
    const parsed = createIssueWorkProductSchema.safeParse({
      type: "artifact",
      provider: "paperclip",
      title: "Final packet",
      url: "/home/node/.openclaw/workspace-ceo/ceo-config-and-runs-report.md",
      status: "ready_for_review",
      metadata: {
        ...validArtifactMetadata,
        contentPath: "/home/node/.openclaw/workspace-ceo/ceo-config-and-runs-report.md",
      },
      createdByRunId: "22222222-2222-4222-8222-222222222222",
    });

    expect(parsed.success).toBe(false);
    if (parsed.success) throw new Error("Expected filesystem-backed artifact metadata to fail validation");
    expect(parsed.error.issues.map((issue) => issue.path.join("."))).toEqual(
      expect.arrayContaining(["metadata.contentPath"]),
    );
  });

  it("rejects artifact metadata with extra contentBase64 payloads", () => {
    const parsed = createIssueWorkProductSchema.safeParse({
      type: "artifact",
      provider: "paperclip",
      title: "Final packet",
      url: validArtifactMetadata.contentPath,
      status: "ready_for_review",
      metadata: {
        ...validArtifactMetadata,
        contentBase64: "IyBGaW5hbCBwYWNrZXQK",
      },
      createdByRunId: "22222222-2222-4222-8222-222222222222",
    });

    expect(parsed.success).toBe(false);
    if (parsed.success) throw new Error("Expected extra artifact metadata keys to fail validation");
    expect(parsed.error.issues.map((issue) => issue.path.join("."))).toEqual(
      expect.arrayContaining(["metadata"]),
    );
  });

  it("rejects partial artifact updates that try to switch to artifact without the required fields", () => {
    const parsed = updateIssueWorkProductSchema.safeParse({
      type: "artifact",
      title: "Final packet",
    });

    expect(parsed.success).toBe(false);
    if (parsed.success) throw new Error("Expected artifact update to fail validation");
    expect(parsed.error.issues.map((issue) => issue.path.join("."))).toEqual(
      expect.arrayContaining(["metadata", "createdByRunId"]),
    );
  });

  it("reports no artifact validation issues for non-artifact products", () => {
    expect(getIssueArtifactWorkProductValidationIssues({
      type: "pull_request",
      url: null,
      metadata: null,
      createdByRunId: null,
    })).toEqual([]);
  });
});
