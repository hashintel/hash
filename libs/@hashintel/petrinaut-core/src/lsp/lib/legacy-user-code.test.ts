import ts from "@typescript/typescript6";
import { describe, expect, it } from "vitest";
import { DiagnosticSeverity, DiagnosticTag } from "vscode-languageserver-types";

import { checkSDCPN } from "./checker";
import { getItemFilePath } from "./file-paths";
import { createSDCPN } from "./helper/create-sdcpn";
import {
  createLanguageServers,
  disposeLanguageServers,
  syncLanguageServers,
} from "./language-servers";
import { serializeDiagnostic } from "./ts-to-lsp";

const model = (legacy: boolean) =>
  createSDCPN({
    types: [{ id: "color", elements: [{ name: "x", type: "real" }] }],
    places: [
      {
        id: "place",
        name: "Place",
        colorId: "color",
        visualizerCode: legacy
          ? 'export default Visualization(({ tokens }) => <svg viewBox="0 0 20 20" style={{ backgroundColor: "white", width: "100%", borderRadius: "6px" }}><circle r={tokens.length} /></svg>);'
          : 'return <Visualizer.Svg backgroundColor="white"><circle r={tokens.length} /></Visualizer.Svg>;',
      },
    ],
    differentialEquations: [
      {
        id: "dynamics",
        colorId: "color",
        code: legacy
          ? "export default Dynamics((tokens) => tokens.map(() => ({ x: 0 })));"
          : "return tokens.map(() => ({ x: 0 }));",
      },
    ],
    transitions: [
      {
        id: "transition",
        inputArcs: [{ placeId: "place", weight: 1, type: "standard" }],
        outputArcs: [{ placeId: "place", weight: 1 }],
        lambdaCode: legacy
          ? "export default Lambda((input) => input.Place[0].x > 0);"
          : "return input.Place[0].x > 0;",
        transitionKernelCode: legacy
          ? "export default TransitionKernel((input) => ({ Place: [input.Place[0]] }));"
          : "return { Place: [input.Place[0]] };",
      },
    ],
  });

describe("legacy user code", () => {
  it("keeps every legacy surface valid and publishes deprecation hints over the authored names", () => {
    const servers = createLanguageServers();
    const sdcpn = model(true);
    try {
      syncLanguageServers(servers, sdcpn);
      const result = checkSDCPN(sdcpn, servers);
      expect(result.isValid).toBe(true);
      const names = result.itemDiagnostics.flatMap((item) => {
        const server =
          item.itemType === "place-visualizer"
            ? servers.visualizer
            : servers.sdcpn;
        const code = server.getUserContent(item.filePath)!;
        return item.diagnostics.map((diagnostic) => {
          expect(diagnostic.category).not.toBe(ts.DiagnosticCategory.Error);
          if (!diagnostic.reportsDeprecated) return "";
          expect(diagnostic.start).toBeGreaterThanOrEqual(0);
          expect(diagnostic.start).toBeLessThan(code.length);
          const marker = serializeDiagnostic(diagnostic, code);
          expect(marker.severity).toBe(DiagnosticSeverity.Hint);
          expect(marker.tags).toEqual([DiagnosticTag.Deprecated]);
          return code.slice(
            diagnostic.start,
            (diagnostic.start ?? 0) + (diagnostic.length ?? 0),
          );
        });
      });
      expect(names).toEqual(
        expect.arrayContaining([
          "Dynamics",
          "Lambda",
          "TransitionKernel",
          "Visualization",
          "svg",
        ]),
      );
    } finally {
      disposeLanguageServers(servers);
    }
  });

  it("includes concise migration instructions in TypeScript hover metadata", () => {
    const servers = createLanguageServers();
    try {
      syncLanguageServers(servers, model(true));
      const file = getItemFilePath("place-visualizer-code", {
        placeId: "place",
      });
      const code = servers.visualizer.getUserContent(file)!;
      for (const [name, instruction] of [
        ["Visualization", "function body directly"],
        ["svg", "Visualizer.Svg"],
      ] as const) {
        const info = servers.visualizer.getQuickInfoAtPosition(
          file,
          code.indexOf(name) + 1,
        );
        const deprecated = info?.tags?.find((tag) => tag.name === "deprecated");
        expect(ts.displayPartsToString(deprecated?.text)).toContain(
          instruction,
        );
      }
    } finally {
      disposeLanguageServers(servers);
    }
  });

  it("removes the hints after migrating the same documents to function bodies", () => {
    const servers = createLanguageServers();
    try {
      syncLanguageServers(servers, model(true));
      expect(
        checkSDCPN(model(true), servers).itemDiagnostics.length,
      ).toBeGreaterThan(0);
      syncLanguageServers(servers, model(false));
      const result = checkSDCPN(model(false), servers);
      expect(result.isValid).toBe(true);
      expect(result.itemDiagnostics).toEqual([]);
    } finally {
      disposeLanguageServers(servers);
    }
  });
});
