import { describe, expect, test } from "vitest";

import { getVoiceExperimentSelection } from "./voice-experiment-selection";

describe("getVoiceExperimentSelection", () => {
  test.each([
    ["openai", "mock"],
    ["openai", "brunch"],
    ["elevenlabs", "brunch"],
  ] as const)("selects %s voice with the %s elicitor", (provider, elicitor) => {
    expect(
      getVoiceExperimentSelection({
        search: `?voiceProvider=${provider}&elicitor=${elicitor}`,
      }),
    ).toEqual({ elicitor, provider });
  });

  test("keeps the experiment shell hidden by default", () => {
    expect(getVoiceExperimentSelection({ search: "" })).toBeNull();
  });

  test("rejects partial, invalid, and unsupported combinations", () => {
    expect(
      getVoiceExperimentSelection({ search: "?voiceProvider=openai" }),
    ).toBeNull();
    expect(
      getVoiceExperimentSelection({ search: "?elicitor=brunch" }),
    ).toBeNull();
    expect(
      getVoiceExperimentSelection({
        search: "?voiceProvider=elevenlabs&elicitor=mock",
      }),
    ).toBeNull();
    expect(
      getVoiceExperimentSelection({
        search: "?voiceProvider=other&elicitor=brunch",
      }),
    ).toBeNull();
  });

  test.each([
    ["openai-realtime", { elicitor: "mock", provider: "openai" }],
    ["elevenlabs-brunch", { elicitor: "brunch", provider: "elevenlabs" }],
  ] as const)("keeps the legacy %s link working", (experiment, selection) => {
    expect(
      getVoiceExperimentSelection({
        search: `?voiceExperiment=${experiment}`,
      }),
    ).toEqual(selection);
  });
});
