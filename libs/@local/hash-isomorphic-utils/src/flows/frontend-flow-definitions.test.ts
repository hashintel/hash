import { describe, expect, it } from "vitest";

import { refineDashboardItemFlowDefinition } from "./frontend-flow-definitions.js";
import { validateFlowDefinition } from "./util.js";

describe("dashboard refinement flow", () => {
  it("wires every refinement input and output to a valid action contract", () => {
    expect(
      validateFlowDefinition(refineDashboardItemFlowDefinition, "ai"),
    ).toBe(true);
  });
});
