import { describe, expect, it } from "vitest";

import { compileHirArtifacts } from "../../hir";
import { isSDCPNEqual } from "../../lib/deep-equal";
import { checkSDCPN } from "../../lsp/lib/checker";
import {
  createLanguageServers,
  syncLanguageServers,
} from "../../lsp/lib/language-servers";
import { mergeDslDocument } from "../merge";
import { parsePetrinautDsl } from "../parse";
import { printPetrinautDsl } from "../print";
import { dslExamples } from "./dsl-examples";

import type { SDCPN } from "../../types/sdcpn";

const emptyNet: SDCPN = {
  places: [],
  transitions: [],
  types: [],
  differentialEquations: [],
  parameters: [],
};

/** `text` as a net, failing the test on any diagnostic. */
const netOf = (text: string, onto: SDCPN = emptyNet): SDCPN => {
  const parsed = parsePetrinautDsl(text);
  expect(parsed.diagnostics).toEqual([]);
  const merged = mergeDslDocument(onto, parsed.document);
  expect(merged.diagnostics).toEqual([]);
  if (!merged.ok) {
    throw new Error("the text did not merge");
  }
  return merged.sdcpn;
};

describe("the DSL examples", () => {
  it("have distinct ids and a title the text's net line carries", () => {
    expect(new Set(dslExamples.map(({ id }) => id)).size).toBe(
      dslExamples.length,
    );
    for (const example of dslExamples) {
      expect(parsePetrinautDsl(example.text).document.title).toBe(
        example.title,
      );
    }
  });
});

describe.each(dslExamples.map((example) => [example.title, example] as const))(
  "DSL example %s",
  (_title, example) => {
    it("parses and merges with no diagnostic", () => {
      netOf(example.text);
    });

    it("compiles every item through the HIR pipeline", () => {
      const { failures } = compileHirArtifacts(netOf(example.text));
      expect(
        failures.map((failure) => ({
          itemId: failure.itemId,
          messages: failure.diagnostics.map((diag) => diag.message),
        })),
      ).toEqual([]);
    });

    it("passes the LSP check with no diagnostics", () => {
      const net = netOf(example.text);
      const servers = createLanguageServers();
      syncLanguageServers(servers, net);
      const result = checkSDCPN(net, servers);
      expect(
        result.itemDiagnostics.map((item) => ({
          itemId: item.itemId,
          messages: item.diagnostics.map((diag) => diag.messageText),
        })),
      ).toEqual([]);
      expect(result.isValid).toBe(true);
    });

    it("prints to a text that reads back as the same net", () => {
      const net = netOf(example.text);
      const printed = printPetrinautDsl({ sdcpn: net, title: example.title });

      const again = netOf(printed.text, net);

      expect(isSDCPNEqual(again, net)).toBe(true);
      expect(
        printPetrinautDsl({ sdcpn: again, title: example.title }).text,
      ).toBe(printed.text);
    });
  },
);
