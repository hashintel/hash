import { ApplicationFailure, CancelledFailure } from "@temporalio/workflow";
import { describe, expect, it } from "vitest";

import { toRunFailure } from "./to-run-failure.js";

describe("toRunFailure", () => {
  it("turns a plain error into a failure that isn't retried", () => {
    const failure = toRunFailure(new Error("Something went wrong"));

    expect(failure).toBeInstanceOf(ApplicationFailure);
    expect(failure).toMatchObject({
      message: "Something went wrong",
      nonRetryable: true,
    });
  });

  it("passes Temporal's failures through", () => {
    const cancelled = new CancelledFailure("Cancelled");

    expect(toRunFailure(cancelled)).toBe(cancelled);
  });
});
