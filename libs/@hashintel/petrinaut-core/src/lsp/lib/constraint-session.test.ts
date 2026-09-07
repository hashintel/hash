import { describe, expect, it } from "vitest";

import { buildMetricContext, buildScenarioExpressionContext } from "../../hir";
import { getHirDiagnosticsForItem } from "./check-hir";
import { SDCPNLanguageServer } from "./create-sdcpn-language-service";
import { getItemFilePath } from "./file-paths";
import { generateConstraintSessionFiles } from "./generate-virtual-files";
import { createSDCPN } from "./helper/create-sdcpn";

import type { ScenarioParameter } from "../../types/sdcpn";
import type { ConstraintSessionData } from "./generate-virtual-files";

const SESSION_ID = "constraint-1";

const SDCPN = createSDCPN({
  places: [{ id: "place_1", name: "P" }],
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

const SCENARIO_PARAMETERS: ScenarioParameter[] = [
  { identifier: "a", type: "real", default: 1 },
  { identifier: "b", type: "integer", default: 2 },
];

const DEFS_PATH = getItemFilePath("constraint-session-defs", {
  sessionId: SESSION_ID,
});
const CODE_PATH = getItemFilePath("constraint-code", { sessionId: SESSION_ID });

function session(
  space: ConstraintSessionData["space"],
  code: string,
): ConstraintSessionData {
  return {
    sessionId: SESSION_ID,
    space,
    code,
    scenarioParameters: SCENARIO_PARAMETERS,
  };
}

function makeServer(data: ConstraintSessionData): SDCPNLanguageServer {
  const server = new SDCPNLanguageServer();
  server.syncFiles(SDCPN);
  server.syncConstraintFiles(SDCPN, data);
  return server;
}

/** The TS diagnostics' messages for the session's code file. */
function constraintDiagnostics(
  space: ConstraintSessionData["space"],
  code: string,
): string[] {
  const server = makeServer(session(space, code));
  return [
    ...server.getSyntacticDiagnostics(CODE_PATH),
    ...server.getSemanticDiagnostics(CODE_PATH),
  ].map((diagnostic) =>
    typeof diagnostic.messageText === "string"
      ? diagnostic.messageText
      : diagnostic.messageText.messageText,
  );
}

describe("constraint session virtual files", () => {
  it("wraps a parameters-space expression as a boolean check over scenario and parameters", () => {
    const files = generateConstraintSessionFiles(
      SDCPN,
      session("parameters", "scenario.a < scenario.b"),
    );

    expect([...files.keys()]).toEqual([DEFS_PATH, CODE_PATH]);
    const defs = files.get(DEFS_PATH)!.content;
    expect(defs).toContain("declare const parameters: Parameters;");
    expect(defs).toContain('"a": number;');
    expect(defs).toContain('"b": number;');
    const code = files.get(CODE_PATH)!;
    expect(code.prefix).toContain("function __check(): boolean { return (");
    expect(code.content).toBe("scenario.a < scenario.b");
    expect(code.suffix).toBe("\n); }");
  });

  it("wraps a state-space body as a boolean function over the metric state", () => {
    const files = generateConstraintSessionFiles(
      SDCPN,
      session("state", 'return state.places["P"].count > 3;'),
    );

    expect([...files.keys()]).toEqual([DEFS_PATH, CODE_PATH]);
    expect(files.get(DEFS_PATH)!.content).toContain(
      '"P": { count: number; tokens: never[] };',
    );
    const code = files.get(CODE_PATH)!;
    expect(code.prefix).toContain("declare const parameters: Parameters;");
    expect(code.prefix).toContain(
      "function __constraint(state: MetricState): boolean {",
    );
    expect(code.suffix).toBe("\n}");
  });

  it("declares `scenario` as an empty record when the study has no parameters", () => {
    const files = generateConstraintSessionFiles(SDCPN, {
      ...session("parameters", "true"),
      scenarioParameters: [],
    });
    expect(files.get(DEFS_PATH)!.content).toContain(
      "declare const scenario: Record<string, never>;",
    );
  });

  it.for(["parameters", "state"] as const)(
    "generates only the defs file for blank %s code",
    (space) => {
      const files = generateConstraintSessionFiles(
        SDCPN,
        session(space, "  \n"),
      );
      expect([...files.keys()]).toEqual([DEFS_PATH]);
    },
  );
});

describe("constraint session diagnostics", () => {
  it("accepts a boolean parameters-space expression", () => {
    expect(
      constraintDiagnostics(
        "parameters",
        "scenario.a < scenario.b && parameters.weight > 1",
      ),
    ).toEqual([]);
  });

  it("rejects a non-boolean parameters-space expression", () => {
    expect(constraintDiagnostics("parameters", "scenario.a + 1")).toEqual([
      "Type 'number' is not assignable to type 'boolean'.",
    ]);
  });

  it("rejects an unknown scenario parameter", () => {
    expect(constraintDiagnostics("parameters", "scenario.nope > 1")).toEqual([
      "Property 'nope' does not exist on type '{ a: number; b: number; }'.",
    ]);
  });

  it("accepts a boolean state-space body", () => {
    expect(
      constraintDiagnostics("state", 'return state.places["P"].count > 3;'),
    ).toEqual([]);
  });

  it("rejects a state-space body returning a number", () => {
    expect(
      constraintDiagnostics("state", 'return state.places["P"].count;'),
    ).toEqual(["Type 'number' is not assignable to type 'boolean'."]);
  });

  it("removes the code file once the session is killed", () => {
    const server = makeServer(session("parameters", "scenario.a > 0"));
    expect(server.getConstraintFileNames(SESSION_ID)).toEqual([
      DEFS_PATH,
      CODE_PATH,
    ]);
    server.removeConstraintSession(SESSION_ID);
    expect(server.getConstraintFileNames(SESSION_ID)).toEqual([]);
  });
});

describe("constraint session completion", () => {
  it("lists the scenario parameters after `scenario.`", () => {
    const code = "scenario.";
    const server = makeServer(session("parameters", code));
    const completions = server.getCompletionsAtPosition(
      CODE_PATH,
      code.length,
      undefined,
    );
    const names = (completions?.entries ?? []).map((entry) => entry.name);
    expect(names).toEqual(["a", "b"]);
  });

  it("lists the places after `state.places.`", () => {
    const code = "return state.places.";
    const server = makeServer(session("state", code));
    const completions = server.getCompletionsAtPosition(
      CODE_PATH,
      code.length,
      undefined,
    );
    const names = (completions?.entries ?? []).map((entry) => entry.name);
    expect(names).toEqual(["P"]);
  });
});

describe("constraint session HIR lint", () => {
  it("passes a boolean parameters-space expression through the constraint's lowering context", () => {
    const context = buildScenarioExpressionContext(
      SDCPN.parameters,
      SCENARIO_PARAMETERS,
      "boolean",
    );
    expect(
      getHirDiagnosticsForItem("scenario.a < scenario.b", context),
    ).toEqual([]);
  });

  it("reports an out-of-subset loop in a state-space body that TypeScript accepts", () => {
    const code = [
      "let total = 0;",
      'for (const step of [1, 2]) { total += step * state.places["P"].count; }',
      "return total > 3;",
    ].join("\n");
    expect(constraintDiagnostics("state", code)).toEqual([]);

    const diagnostics = getHirDiagnosticsForItem(
      code,
      buildMetricContext(SDCPN, undefined, "boolean"),
    );
    expect(diagnostics.map((diagnostic) => diagnostic.source)).toContain("hir");
  });
});
