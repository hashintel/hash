import { describe, expect, test } from "vitest";

import * as binding from "../src/index";

describe("the Flue binding public surface", () => {
  test("keeps generalized typed elicitation suspended", () => {
    expect(binding).not.toHaveProperty("useElicitation");
    expect(binding).toHaveProperty("createFlueHistoryReader");
    expect(binding).toHaveProperty("createLocalCaptureStore");
  });
});
