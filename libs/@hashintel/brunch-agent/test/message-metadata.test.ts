import { describe, expect, test } from "vitest";

import { projectBrunchMessageMetadata } from "../src/client-tools";

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

  test("drops an agent-authored stopped marker and keeps other agent metadata", () => {
    expect(
      projectBrunchMessageMetadata({
        agentMetadata: { stopped: true, source: "voice" },
        outcome: "completed",
      }),
    ).toEqual({ source: "voice" });
  });
});
