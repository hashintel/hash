import { readFileSync } from "node:fs";

import { describe, expect, test } from "vitest";

const packageRoot = new URL("../", import.meta.url);
const contextRoot = new URL("../../../", import.meta.url);

const reusableGuidanceFiles = [
  "src/flue.ts",
  "src/prompts/APPEND_SYSTEM.md",
  "src/skills/sdcpn-modelling/SKILL.md",
  "src/skills/sdcpn-modelling/references/checks.md",
  "src/skills/sdcpn-modelling/references/pn-construction.md",
  "src/skills/sdcpn-modelling/references/profile.md",
  "src/skills/sdcpn-modelling/templates/workpiece.md",
  "src/tools/mutate-petrinet.ts",
] as const;

const inventoryFixtureTerms = [
  "inventory-purchasing",
  "reorder_point",
  "lead_time_days",
  "daily_demand",
  "on_hand_drawdown",
  "receive_delivery",
  "place_order",
  "Supplier lead time",
  "Daily demand",
  "OnOrder",
  "OnHand",
] as const;

const portfolioCases = [
  "vestera-scheduling",
  "data-centre-thermal-operations",
  "industrial-gas-vmi",
  "pharma-cold-chain",
  "semiconductor-fab-operations",
  "truck-fleet-maintenance",
] as const;

describe("portfolio portability", () => {
  test("keeps Inventory fixture nouns and IDs out of reusable guidance", () => {
    for (const relativePath of reusableGuidanceFiles) {
      const content = readFileSync(new URL(relativePath, packageRoot), "utf8");
      for (const term of inventoryFixtureTerms) {
        expect(content, `${relativePath} contains ${term}`).not.toContain(term);
      }
    }
  });

  test("keeps all six named packs available as independent probe inputs", () => {
    for (const caseName of portfolioCases) {
      for (const fileName of ["situation-pack.md", "opening-message.md"]) {
        const content = readFileSync(
          new URL(`evaluations/cases/${caseName}/${fileName}`, contextRoot),
          "utf8",
        );
        expect(
          content.trim().length,
          `${caseName}/${fileName}`,
        ).toBeGreaterThan(0);
      }
    }
  });
});
