import { describe, expect, it } from "vitest";

import { compileHirArtifacts } from "../hir";
import { checkSDCPN } from "../lsp/lib/checker";
import {
  createLanguageServers,
  syncLanguageServers,
} from "../lsp/lib/language-servers";
import {
  cafeQueue,
  deploymentPipelineSDCPN,
  dronePatrol,
  probabilisticSatellitesSDCPN,
  productionMachines,
  sirModel,
  supplyChainProfit,
  supplyChainWithDisruption,
  vaccinationCampaign,
} from "./index";

const EXAMPLES = [
  cafeQueue,
  deploymentPipelineSDCPN,
  dronePatrol,
  probabilisticSatellitesSDCPN,
  productionMachines,
  sirModel,
  supplyChainProfit,
  supplyChainWithDisruption,
  vaccinationCampaign,
];

describe.each(EXAMPLES.map((example) => [example.title, example] as const))(
  "example %s",
  (_title, example) => {
    it("compiles every item through the HIR pipeline", () => {
      const { failures } = compileHirArtifacts(example.petriNetDefinition);
      expect(
        failures.map((failure) => ({
          itemId: failure.itemId,
          messages: failure.diagnostics.map((diag) => diag.message),
        })),
      ).toEqual([]);
    });

    it("passes the LSP check with no diagnostics", () => {
      const servers = createLanguageServers();
      syncLanguageServers(servers, example.petriNetDefinition);
      const result = checkSDCPN(example.petriNetDefinition, servers);
      expect(
        result.itemDiagnostics.map((item) => ({
          itemId: item.itemId,
          messages: item.diagnostics.map((diag) => diag.messageText),
        })),
      ).toEqual([]);
      expect(result.isValid).toBe(true);
    });
  },
);
