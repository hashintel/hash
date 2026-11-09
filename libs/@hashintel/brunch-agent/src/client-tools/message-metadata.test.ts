import { describe, expect, test } from "vitest";

import { projectBrunchMessageMetadata } from "./message-metadata";

describe("projectBrunchMessageMetadata", () => {
  test("marks only a durably aborted response stopped", () => {
    expect(
      projectBrunchMessageMetadata({
        agentMetadata: undefined,
        outcome: "aborted",
      }),
    ).toEqual({ stopped: true });
    expect(
      projectBrunchMessageMetadata({
        agentMetadata: undefined,
        outcome: "completed",
      }),
    ).toBeUndefined();
  });

  test("marks only a durably failed response failed", () => {
    expect(
      projectBrunchMessageMetadata({
        agentMetadata: undefined,
        outcome: "failed",
      }),
    ).toEqual({ failed: true });
    expect(
      projectBrunchMessageMetadata({
        agentMetadata: { source: "voice" },
        outcome: undefined,
      }),
    ).toEqual({ source: "voice" });
  });

  test("drops agent-authored ending markers and keeps other agent metadata", () => {
    const agentMetadata = { stopped: true, failed: true, source: "voice" };
    expect(
      projectBrunchMessageMetadata({ agentMetadata, outcome: "completed" }),
    ).toEqual({ source: "voice" });
    expect(
      projectBrunchMessageMetadata({ agentMetadata, outcome: undefined }),
    ).toEqual({ source: "voice" });
    expect(
      projectBrunchMessageMetadata({ agentMetadata, outcome: "aborted" }),
    ).toEqual({ source: "voice", stopped: true });
    expect(
      projectBrunchMessageMetadata({ agentMetadata, outcome: "failed" }),
    ).toEqual({ source: "voice", failed: true });
  });
});
