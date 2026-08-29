import { describe, expect, it } from "vitest";

import { compileHirArtifacts } from "../hir";
import { checkSDCPN } from "../lsp/lib/checker";
import { SDCPNLanguageServer } from "../lsp/lib/create-sdcpn-language-service";
import {
  deploymentPipelineSDCPN,
  probabilisticSatellitesSDCPN,
  productionMachines,
  sirModel,
  supplyChainProfit,
  supplyChainWithDisruption,
} from "./index";

const EXAMPLES = [
  deploymentPipelineSDCPN,
  probabilisticSatellitesSDCPN,
  productionMachines,
  sirModel,
  supplyChainProfit,
  supplyChainWithDisruption,
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
      const server = new SDCPNLanguageServer();
      server.syncFiles(example.petriNetDefinition);
      const result = checkSDCPN(example.petriNetDefinition, server);
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
