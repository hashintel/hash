import { describe, expect, it } from "vitest";

import { adHocSlotKey } from "../../simulation/authoring/scenario/ad-hoc-scenario";
import { SDCPNLanguageServer } from "./create-sdcpn-language-service";
import { getItemFilePath } from "./file-paths";
import { createSDCPN } from "./helper/create-sdcpn";

import type {
  AdHocScenarioState,
  AdHocSlot,
} from "../../simulation/authoring/scenario/ad-hoc-scenario";
import type { AdHocSessionData } from "./generate-virtual-files";

/**
 * A net mirroring the satellites example: a coloured place plus a net-level
 * parameter, both referenced from ad-hoc value expressions.
 */
const SDCPN = createSDCPN({
  types: [
    {
      id: "c1",
      elements: [
        { name: "x", type: "real" },
        { name: "worn", type: "boolean" },
      ],
    },
  ],
  places: [{ id: "pl1", name: "Space", colorId: "c1" }],
  parameters: [{ id: "p1", variableName: "planet_radius", type: "real" }],
});

const SESSION_ID = "adhoc1";

function makeState(
  overrides: Partial<AdHocScenarioState> = {},
): AdHocScenarioState {
  return {
    variables: [
      {
        name: "altitude",
        type: "real",
        expression: "parameters.planet_radius + 400",
        optimize: null,
      },
    ],
    netParameters: [],
    places: {
      pl1: {
        kind: "coloured",
        variables: [
          { name: "angle", type: "real", expression: "i * 2", optimize: null },
        ],
        rows: [
          {
            kind: "template",
            count: { expression: "3", optimize: null },
            cells: [
              { expression: "scenario.altitude + angle", optimize: null },
              { expression: "i === count - 1", optimize: null },
            ],
          },
        ],
        sharedColumns: {},
      },
    },
    ...overrides,
  };
}

function makeServer(state: AdHocScenarioState): SDCPNLanguageServer {
  const server = new SDCPNLanguageServer();
  server.syncFiles(SDCPN);
  const session: AdHocSessionData = { sessionId: SESSION_ID, state };
  server.syncAdHocFiles(SDCPN, session);
  return server;
}

function slotDiagnostics(
  server: SDCPNLanguageServer,
  slot: AdHocSlot,
): string[] {
  const filePath = getItemFilePath("adhoc-value-code", {
    sessionId: SESSION_ID,
    slotKey: adHocSlotKey(slot),
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

describe("ad-hoc session diagnostics", () => {
  it("accepts expressions using parameters, scenario variables, i, count, and place variables", () => {
    const server = makeServer(makeState());
    expect(
      slotDiagnostics(server, {
        target: { kind: "variable", placeId: null, index: 0 },
        part: "expression",
      }),
    ).toEqual([]);
    expect(
      slotDiagnostics(server, {
        target: { kind: "cell", placeId: "pl1", row: 0, column: 0 },
        part: "expression",
      }),
    ).toEqual([]);
    expect(
      slotDiagnostics(server, {
        target: { kind: "cell", placeId: "pl1", row: 0, column: 1 },
        part: "expression",
      }),
    ).toEqual([]);
  });

  it("rejects a numeric expression in a boolean cell", () => {
    const state = makeState();
    const place = state.places["pl1"];
    if (place?.kind !== "coloured") {
      throw new Error("fixture should be coloured");
    }
    place.rows[0]!.cells[1] = { expression: "1 + 2", optimize: null };

    const diagnostics = slotDiagnostics(makeServer(state), {
      target: { kind: "cell", placeId: "pl1", row: 0, column: 1 },
      part: "expression",
    });
    expect(diagnostics.join("\n")).toContain("boolean");
  });

  it("rejects an unknown identifier", () => {
    const state = makeState();
    const place = state.places["pl1"];
    if (place?.kind !== "coloured") {
      throw new Error("fixture should be coloured");
    }
    place.rows[0]!.cells[0] = { expression: "wibble + 1", optimize: null };

    const diagnostics = slotDiagnostics(makeServer(state), {
      target: { kind: "cell", placeId: "pl1", row: 0, column: 0 },
      part: "expression",
    });
    expect(diagnostics.join("\n")).toContain("wibble");
  });

  it("keeps `i` out of scope in optimize bounds", () => {
    const state = makeState();
    const place = state.places["pl1"];
    if (place?.kind !== "coloured") {
      throw new Error("fixture should be coloured");
    }
    place.rows[0]!.cells[0] = {
      expression: "1",
      optimize: { min: "i", max: "10", scale: "linear" },
    };

    const server = makeServer(state);
    const diagnostics = slotDiagnostics(server, {
      target: { kind: "cell", placeId: "pl1", row: 0, column: 0 },
      part: "min",
    });
    expect(diagnostics.join("\n")).toContain("i");
    expect(
      slotDiagnostics(server, {
        target: { kind: "cell", placeId: "pl1", row: 0, column: 0 },
        part: "max",
      }),
    ).toEqual([]);
  });

  it("generates no file for an empty expression and removes files on kill", () => {
    const state = makeState();
    const place = state.places["pl1"];
    if (place?.kind !== "coloured") {
      throw new Error("fixture should be coloured");
    }
    place.rows[0]!.cells[0] = { expression: "", optimize: null };

    const server = makeServer(state);
    const emptyCellPath = getItemFilePath("adhoc-value-code", {
      sessionId: SESSION_ID,
      slotKey: adHocSlotKey({
        target: { kind: "cell", placeId: "pl1", row: 0, column: 0 },
        part: "expression",
      }),
    });
    expect(server.getAdHocFileNames(SESSION_ID)).not.toContain(emptyCellPath);
    expect(server.getAdHocFileNames(SESSION_ID).length).toBeGreaterThan(1);

    server.removeAdHocSession(SESSION_ID);
    expect(server.getAdHocFileNames(SESSION_ID)).toEqual([]);
  });
});
