import { describe, expect, it } from "vitest";

import { SDCPNLanguageServer } from "./create-sdcpn-language-service";
import { getItemFilePath } from "./file-paths";
import { createSDCPN } from "./helper/create-sdcpn";

import type { ScenarioSessionData } from "./generate-virtual-files";

/**
 * A net mirroring the satellites example: a coloured place plus a net-level
 * parameter, both referenced from initial-state code.
 */
const SDCPN = createSDCPN({
  types: [
    {
      id: "c1",
      elements: [
        { name: "x", type: "real" },
        { name: "y", type: "real" },
        { name: "direction", type: "real" },
        { name: "velocity", type: "real" },
      ],
    },
  ],
  places: [{ id: "pl1", name: "Space", colorId: "c1" }],
  parameters: [{ id: "p1", variableName: "planet_radius", type: "real" }],
});

const SESSION_DEFAULTS: Omit<ScenarioSessionData, "initialStateCode"> = {
  sessionId: "sess1",
  scenarioParameters: [
    { identifier: "number_of_satellites", type: "integer", default: 3 },
  ],
  parameterOverrides: {},
  initialState: {},
  initialStateAsCode: true,
};

function getInitialStateDiagnostics(initialStateCode: string): string[] {
  const server = new SDCPNLanguageServer();
  server.syncFiles(SDCPN);
  server.syncScenarioFiles(SDCPN, { ...SESSION_DEFAULTS, initialStateCode });
  const filePath = getItemFilePath("scenario-initial-state-full-code", {
    sessionId: SESSION_DEFAULTS.sessionId,
  });
  return [
    ...server.getSyntacticDiagnostics(filePath),
    ...server.getSemanticDiagnostics(filePath),
  ].map((diagnostic) =>
    typeof diagnostic.messageText === "string"
      ? diagnostic.messageText
      : diagnostic.messageText.messageText,
  );
}

describe("scenario session initial-state-as-code diagnostics", () => {
  it("reports no diagnostics for valid code using range, scenario, and parameters", () => {
    const diagnostics = getInitialStateDiagnostics(`return {
      Space: range(scenario.number_of_satellites).map(i => {
        const angle = Math.PI * 2 * (i / scenario.number_of_satellites);
        const altitude = parameters.planet_radius;
        return {
          x: Math.cos(angle) * altitude,
          y: Math.sin(angle) * altitude,
          direction: angle,
          velocity: 0,
        };
      }),
    };`);

    expect(diagnostics).toEqual([]);
  });

  it("reports no diagnostics for empty code", () => {
    // Regression: an empty "Define as code" editor used to produce
    // TS2355 ("A function whose declared type is neither 'undefined',
    // 'void', nor 'any' must return a value.") because the empty body was
    // wrapped in `function __check(): InitialState {}`. The runtime compiler
    // treats empty code as "no initial state", so the LSP must not complain.
    for (const emptyCode of ["", "   \n  "]) {
      expect(getInitialStateDiagnostics(emptyCode)).toEqual([]);
    }
  });

  it("keeps the virtual file for empty code so completions still resolve", () => {
    // The file must exist even when empty: this editor is where users press
    // Ctrl+Space to discover the injected helpers, and TypeScript throws
    // ("Could not find source file") when asked to complete against a path
    // with no source file behind it.
    for (const emptyCode of ["", "   \n  "]) {
      const server = new SDCPNLanguageServer();
      server.syncFiles(SDCPN);
      server.syncScenarioFiles(SDCPN, {
        ...SESSION_DEFAULTS,
        initialStateCode: emptyCode,
      });
      const filePath = getItemFilePath("scenario-initial-state-full-code", {
        sessionId: SESSION_DEFAULTS.sessionId,
      });

      expect(server.getFileContent(filePath)).toBeDefined();
      expect(server.getScenarioFileNames(SESSION_DEFAULTS.sessionId)).toContain(
        filePath,
      );

      const completions = server.getCompletionsAtPosition(
        filePath,
        emptyCode.length,
        undefined,
      );
      const names = (completions?.entries ?? []).map((entry) => entry.name);
      expect(names).toContain("range");
      expect(names).toContain("scenario");
      expect(names).toContain("parameters");
    }
  });

  it("still reports diagnostics for non-empty code with real errors", () => {
    const diagnostics = getInitialStateDiagnostics("const unused = 1;");

    expect(
      diagnostics.some((message) => message.includes("must return a value")),
    ).toBe(true);
  });
});
