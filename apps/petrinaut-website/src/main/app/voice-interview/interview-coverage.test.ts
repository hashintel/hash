import { describe, expect, test } from "vitest";

import { SWEEP_TOOL_NAME } from "@hashintel/brunch-agent-transport-aisdk/client-tools";

import { selectInterviewCoverage } from "./interview-coverage";

import type { PetrinautAiMessage } from "@hashintel/petrinaut/ui";

describe("interview coverage", () => {
  test("uses only authoritative completion results for covered and open topics", () => {
    const messages = [
      {
        id: "assistant-sweep",
        role: "assistant",
        parts: [
          {
            type: "dynamic-tool",
            toolCallId: "sweep-1",
            toolName: SWEEP_TOOL_NAME,
            state: "output-available",
            input: {},
            output: {
              status: "applied",
              appliedCaptureIds: ["capture-owner"],
              captures: [
                {
                  id: "capture-owner",
                  status: "active",
                  epistemicStatus: "explicit",
                  confidence: "high",
                  content: {
                    value: {
                      type: "slot-asserted",
                      kind: "activity",
                      node: "approval",
                      slot: "who performs it",
                      precision: "named",
                      assertion: { value: "shift lead" },
                    },
                  },
                },
                {
                  id: "capture-old",
                  status: "superseded",
                  epistemicStatus: "explicit",
                  confidence: "high",
                  content: {
                    value: {
                      type: "slot-asserted",
                      kind: "activity",
                      node: "approval",
                      slot: "how long it takes",
                      assertion: { value: "one hour" },
                    },
                  },
                },
              ],
              completion: {
                complete: false,
                pluginVersion: "sdcpn/1",
                revision: "revision-1",
                failures: [
                  {
                    diagnostic: "unaddressed",
                    nodeId: "activity:approval",
                    kind: "activity",
                    slot: "how long it takes",
                    requirement: "spread",
                    actual: "not mentioned",
                    message: "Duration is still unknown.",
                    captureIds: [],
                  },
                ],
                sliceNodeIds: ["activity:approval", "activity:dispatch"],
                outsideSlice: [],
              },
            },
          },
        ],
      },
    ] as unknown as PetrinautAiMessage[];

    expect(selectInterviewCoverage(messages)).toEqual({
      complete: false,
      covered: ["dispatch"],
      stillExploring: ["approval — how long it takes"],
    });
  });

  test("names each covered topic once when node identifiers share a label", () => {
    const messages = [
      {
        id: "assistant-sweep",
        role: "assistant",
        parts: [
          {
            type: "dynamic-tool",
            toolCallId: "sweep-2",
            toolName: SWEEP_TOOL_NAME,
            state: "output-available",
            input: {},
            output: {
              status: "applied",
              appliedCaptureIds: [],
              captures: [],
              completion: {
                complete: true,
                pluginVersion: "sdcpn/1",
                revision: "revision-2",
                failures: [],
                sliceNodeIds: ["activity:approval", "object:approval"],
                outsideSlice: [],
              },
            },
          },
        ],
      },
    ] as unknown as PetrinautAiMessage[];

    expect(selectInterviewCoverage(messages)?.covered).toEqual(["approval"]);
  });

  test("omits coverage when no validated completion report exists", () => {
    expect(selectInterviewCoverage([])).toBeNull();
  });
});
