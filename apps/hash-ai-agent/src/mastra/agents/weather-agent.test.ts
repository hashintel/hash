import { runEvals } from "@mastra/core/evals";
import { describe, expect, it } from "vitest";

import { completenessScorer } from "../scorers/weather-scorer";
import { weatherAgent } from "./weather-agent";

describe.skip("Weather Agent Tests", () => {
  it("should correctly extract locations from queries", async () => {
    const result = await runEvals({
      data: [
        {
          input: "weather in Berlin",
          groundTruth: { expectedLocation: "Berlin", expectedCountry: "DE" },
        },
        {
          input: "weather in Berlin, Maryland",
          groundTruth: { expectedLocation: "Berlin", expectedCountry: "US" },
        },
        {
          input: "weather in Berlin, Russia",
          groundTruth: { expectedLocation: "Berlin", expectedCountry: "RU" },
        },
      ],
      target: weatherAgent,
      scorers: [completenessScorer], // FIXME: this should be something else
    });

    // Assert aggregate score meets threshold
    expect(result.scores["location-accuracy"]).toBe(1);
    expect(result.summary.totalItems).toBe(3);
  });
});
