import { describe, expect, test } from "vitest";

import { getVoiceExperiment } from "./voice-experiment-selection";

describe("getVoiceExperiment", () => {
  test.each(["openai-realtime", "elevenlabs-brunch"] as const)(
    "selects the %s experiment for the lifetime of the page",
    (experiment) => {
      expect(
        getVoiceExperiment({ search: `?voiceExperiment=${experiment}` }),
      ).toBe(experiment);
    },
  );

  test("keeps the experiment shell hidden by default", () => {
    expect(getVoiceExperiment({ search: "" })).toBeNull();
  });

  test("rejects the superseded prototype parameter and aliases", () => {
    expect(
      getVoiceExperiment({ search: "?voicePrototype=elevenlabs" }),
    ).toBeNull();
    expect(
      getVoiceExperiment({ search: "?voiceExperiment=openai" }),
    ).toBeNull();
    expect(
      getVoiceExperiment({ search: "?voiceExperiment=elevenlabs" }),
    ).toBeNull();
  });
});
