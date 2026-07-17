import { describe, expect, it } from "vitest";

import { SDCPNLanguageServer } from "./create-sdcpn-language-service";
import { generateMetricSessionFiles } from "./generate-virtual-files";
import { createSDCPN } from "./helper/create-sdcpn";

import type { SDCPN } from "../../types/sdcpn";

const SESSION_ID = "session-1";

function sdcpnWithParameter(): SDCPN {
  return createSDCPN({
    places: [{ id: "place_1", name: "Pool" }],
    parameters: [
      {
        id: "param_1",
        name: "Weight",
        variableName: "weight",
        type: "real",
        defaultValue: "2",
      },
    ],
  });
}

/** Collect the TS semantic + syntactic diagnostics for a metric body. */
function metricDiagnostics(sdcpn: SDCPN, code: string): string[] {
  const server = new SDCPNLanguageServer();
  server.syncFiles(sdcpn);
  server.syncMetricFiles(sdcpn, { sessionId: SESSION_ID, code });

  return server
    .getMetricFileNames(SESSION_ID)
    .filter((fileName) => !fileName.endsWith("/defs.d.ts"))
    .flatMap((fileName) => [
      ...server.getSyntacticDiagnostics(fileName),
      ...server.getSemanticDiagnostics(fileName),
    ])
    .map((diagnostic) =>
      typeof diagnostic.messageText === "string"
        ? diagnostic.messageText
        : diagnostic.messageText.messageText,
    );
}

describe("metric LSP session", () => {
  it("declares ambient `parameters` in the generated metric code file", () => {
    const files = generateMetricSessionFiles(sdcpnWithParameter(), {
      sessionId: SESSION_ID,
      code: "return parameters.weight;",
    });
    const codeFile = [...files.values()].find((file) =>
      file.prefix?.includes("declare const parameters"),
    );
    expect(codeFile).toBeDefined();
    expect(codeFile!.prefix).toContain("import type { Parameters }");
  });

  it("type-checks a metric reading a defined net parameter", () => {
    const diagnostics = metricDiagnostics(
      sdcpnWithParameter(),
      "return state.places.Pool.count * parameters.weight;",
    );
    expect(diagnostics).toEqual([]);
  });

  it("flags a metric reading an unknown net parameter", () => {
    const diagnostics = metricDiagnostics(
      sdcpnWithParameter(),
      "return parameters.missing;",
    );
    expect(diagnostics.join("\n")).toMatch(/missing/);
  });
});
