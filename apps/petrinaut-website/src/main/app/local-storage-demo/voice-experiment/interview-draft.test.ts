import { describe, expect, test } from "vitest";

import { createMockInterviewDraft } from "./interview-draft";

describe("createMockInterviewDraft", () => {
  test("creates a visible placeholder net when the elicitor has no structured captures", () => {
    const result = createMockInterviewDraft({
      captures: [],
      conversationId: "conversation-1",
      transcript: [
        {
          speaker: "assistant",
          transcript: "What process would you like to model?",
          turnId: 1,
        },
        {
          speaker: "expert",
          transcript: "Battery charging.",
          turnId: 1,
        },
      ],
    });

    expect(result).toMatchObject({
      conversationId: "conversation-1",
      source: "mock",
      title: "Battery charging — mock draft",
    });
    expect(result.petriNetDefinition.places).toHaveLength(2);
    expect(result.petriNetDefinition.transitions).toHaveLength(1);
    expect(result.petriNetDefinition.transitions[0]).toMatchObject({
      inputArcs: [
        {
          placeId: "place__mock-interview-input",
          type: "standard",
          weight: 1,
        },
      ],
      outputArcs: [{ placeId: "place__mock-draft-ready", weight: 1 }],
    });
    expect(result.petriNetDefinition.scenarios?.[0]?.initialState).toEqual({
      type: "per_place",
      content: {
        "place__mock-draft-ready": "0",
        "place__mock-interview-input": "1",
      },
    });
    expect(result.warnings[0]).toContain("placeholder net");
  });

  test("projects state, step, and flow calls through the future draft contract", () => {
    const result = createMockInterviewDraft({
      captures: [
        {
          captureId: "capture-state-1",
          toolName: "record_process_state",
          input: {
            name: "Battery empty",
            description: "The battery starts empty.",
            category: "state",
          },
        },
        {
          captureId: "capture-step-1",
          toolName: "record_process_step",
          input: {
            name: "Charge battery",
            description: "The charger fills the battery.",
          },
        },
        {
          captureId: "capture-state-2",
          toolName: "record_process_state",
          input: {
            name: "Battery charged",
            description: "The battery is ready.",
            category: "state",
          },
        },
        {
          captureId: "capture-flow-1",
          toolName: "record_process_flow",
          input: { from: "Battery empty", to: "Charge battery" },
        },
        {
          captureId: "capture-flow-2",
          toolName: "record_process_flow",
          input: { from: "Charge battery", to: "Battery charged" },
        },
      ],
      conversationId: "conversation-2",
      transcript: [
        {
          speaker: "expert",
          transcript: "Battery charging.",
          turnId: 1,
        },
      ],
    });

    expect(result.petriNetDefinition.places.map(({ name }) => name)).toEqual([
      "BatteryEmpty",
      "BatteryCharged",
    ]);
    expect(result.petriNetDefinition.transitions).toEqual([
      expect.objectContaining({
        name: "ChargeBattery",
        inputArcs: [{ placeId: "place__mock-1", type: "standard", weight: 1 }],
        outputArcs: [{ placeId: "place__mock-2", weight: 1 }],
      }),
    ]);
    expect(result.captures).toHaveLength(5);
    expect(result.warnings[0]).toContain("mock projector");
  });
});
