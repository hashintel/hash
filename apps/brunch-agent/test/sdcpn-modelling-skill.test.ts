import { describe, expect, test } from "vitest";

import {
  RUNBOOK_RESOURCE_FILES,
  RUNBOOK_SKILL_NAME,
  sdcpnModellingSkill,
} from "../src/skills/sdcpn-modelling.ts";

describe("the sdcpn-modelling skill package", () => {
  test("loads one skill with the four supporting resources", () => {
    expect(sdcpnModellingSkill.name).toBe(RUNBOOK_SKILL_NAME);
    expect(sdcpnModellingSkill.description.length).toBeGreaterThan(0);
    expect(sdcpnModellingSkill.description.length).toBeLessThanOrEqual(1024);
    expect(sdcpnModellingSkill.instructions).toContain("Lifecycle");
    expect(Object.keys(sdcpnModellingSkill.files ?? {})).toEqual([
      ...RUNBOOK_RESOURCE_FILES,
    ]);
    expect(sdcpnModellingSkill.files?.["elicitation.md"]).toContain(
      "provenance: universal",
    );
    expect(sdcpnModellingSkill.files?.["elicitation.md"]).not.toMatch(
      /Vestera|truck fleet|semiconductor/i,
    );
    expect(sdcpnModellingSkill.files?.["pn-construction.md"]).toContain(
      "Timed work",
    );
  });
});
