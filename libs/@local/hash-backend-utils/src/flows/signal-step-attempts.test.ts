import { ApplicationFailure } from "@temporalio/common";
import { describe, expect, it } from "vitest";

import { isRetried } from "./signal-step-attempts.js";

/* A failure is signalled only if Temporal retries it, so a wrong decision reports the last failure twice, or drops one. */
describe("isRetried", () => {
  const retryPolicy = {
    maximumAttempts: 3,
    nonRetryableErrorTypes: ["InvalidInput"],
  };

  it.each([
    ["an attempt before the last", 2, new Error("Failed"), true],
    ["the last attempt", 3, new Error("Failed"), false],
    [
      "a non-retryable failure",
      1,
      ApplicationFailure.nonRetryable("Failed"),
      false,
    ],
    [
      "a failure of a type the policy doesn't retry",
      1,
      ApplicationFailure.create({ message: "Failed", type: "InvalidInput" }),
      false,
    ],
    [
      "an error whose name the policy doesn't retry",
      1,
      Object.assign(new Error("Failed"), { name: "InvalidInput" }),
      false,
    ],
  ])("decides for %s", (_, attempt, error, retried) => {
    expect(isRetried({ attempt, retryPolicy }, error)).toBe(retried);
  });

  it("retries every attempt under a policy without a maximum", () => {
    expect(
      isRetried(
        { attempt: 50, retryPolicy: { maximumAttempts: 0 } },
        new Error("Failed"),
      ),
    ).toBe(true);
  });
});
