import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

import { describe, expect, test } from "vitest";

import { parseSDCPNFile } from "@hashintel/petrinaut-core";
import { checkDefinition } from "@hashintel/petrinaut-core/diagnostics";

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

  test("retains the established compiler-clean Inventory reference as a separate flagship input", () => {
    const path = new URL(
      "evaluations/cases/inventory-purchasing/reference-sdcpn.json",
      contextRoot,
    );
    const bytes = readFileSync(path);
    expect(createHash("sha256").update(bytes).digest("hex")).toBe(
      "81329d7beb1babae64f525ab78b7f1da60b5e67921b76fed7cfde36554985c56",
    );
    const parsed = parseSDCPNFile(JSON.parse(bytes.toString("utf8")));
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) throw new Error(parsed.error);
    expect(parsed.hadMissingPositions).toBe(false);
    expect({
      places: parsed.sdcpn.places.length,
      transitions: parsed.sdcpn.transitions.length,
      types: parsed.sdcpn.types.length,
      parameters: parsed.sdcpn.parameters.length,
      differentialEquations: parsed.sdcpn.differentialEquations.length,
      scenarios: parsed.sdcpn.scenarios?.length ?? 0,
      metrics: parsed.sdcpn.metrics?.length ?? 0,
    }).toEqual({
      places: 38,
      transitions: 45,
      types: 9,
      parameters: 58,
      differentialEquations: 9,
      scenarios: 10,
      metrics: 45,
    });
    expect(checkDefinition(parsed.sdcpn)).toEqual({
      isValid: true,
      itemDiagnostics: [],
    });
  });
});
