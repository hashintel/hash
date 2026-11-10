import { describe, expect, it } from "vitest";

import { checkSDCPN } from "./lsp/lib/checker";
import { createSDCPN } from "./lsp/lib/helper/create-sdcpn";
import {
  createLanguageServers,
  disposeLanguageServers,
  syncLanguageServers,
} from "./lsp/lib/language-servers";
import { migrateLegacyDynamics } from "./migrate-legacy-dynamics";

const wholePlaceCode = `const k = parameters.k;
return tokens.map(({ x }) => ({ x: -k * x }));`;

const oneTokenCode = `const k = parameters.k;
const { x } = token;
return { x: -k * x };`;

describe("migrateLegacyDynamics", () => {
  it("turns a place's legacy equation link into its first dynamics term", () => {
    const migrated = migrateLegacyDynamics({
      places: [
        { id: "linked", differentialEquationId: "de1" },
        {
          id: "both",
          differentialEquationId: "de1",
          dynamics: [{ differentialEquationId: "de2" }],
        },
        { id: "unlinked", differentialEquationId: null },
        { id: "current", dynamics: [{ differentialEquationId: "de2" }] },
      ],
    });
    expect(migrated.places).toEqual([
      { id: "linked", dynamics: [{ differentialEquationId: "de1" }] },
      {
        id: "both",
        dynamics: [
          { differentialEquationId: "de1" },
          { differentialEquationId: "de2" },
        ],
      },
      { id: "unlinked" },
      { id: "current", dynamics: [{ differentialEquationId: "de2" }] },
    ]);
  });

  it("gives an equation without an arity one token and rewrites its whole-place code", () => {
    const migrated = migrateLegacyDynamics({
      places: [],
      differentialEquations: [
        { id: "legacy", code: wholePlaceCode },
        { id: "pair", arity: 2, code: wholePlaceCode },
        { id: "current", arity: 1, code: oneTokenCode },
      ],
    });
    expect(migrated.differentialEquations).toEqual([
      { id: "legacy", arity: 1, code: oneTokenCode },
      { id: "pair", arity: 2, code: wholePlaceCode },
      { id: "current", arity: 1, code: oneTokenCode },
    ]);
  });

  it("keeps whole-place code it cannot rewrite exactly, as an arity-1 equation", () => {
    const code = "return tokens.map((t, index) => ({ x: index }));";
    const migrated = migrateLegacyDynamics({
      places: [],
      differentialEquations: [{ id: "indexed", code }],
    });
    expect(migrated.differentialEquations).toEqual([
      { id: "indexed", arity: 1, code },
    ]);
  });

  it("migrates subnets the same way", () => {
    const migrated = migrateLegacyDynamics({
      places: [],
      subnets: [
        {
          places: [{ id: "p", differentialEquationId: "de" }],
          differentialEquations: [{ id: "de", code: wholePlaceCode }],
        },
      ],
    });
    expect(migrated.subnets).toEqual([
      {
        places: [{ id: "p", dynamics: [{ differentialEquationId: "de" }] }],
        differentialEquations: [{ id: "de", arity: 1, code: oneTokenCode }],
      },
    ]);
  });

  it("is the identity on a current net", () => {
    const net = {
      places: [{ id: "p", dynamics: [{ differentialEquationId: "de" }] }],
      differentialEquations: [{ id: "de", arity: 1, code: oneTokenCode }],
    };
    expect(migrateLegacyDynamics(net)).toEqual(net);
  });

  it("makes a net saved with whole-place code pass the language check", () => {
    const legacy = createSDCPN({
      types: [{ id: "color", elements: [{ name: "x", type: "real" }] }],
      places: [
        {
          id: "place",
          name: "Place",
          colorId: "color",
          dynamicsEnabled: true,
          dynamics: [{ differentialEquationId: "dynamics" }],
        },
      ],
      parameters: [
        {
          id: "k",
          name: "k",
          variableName: "k",
          type: "real",
          defaultValue: "1",
        },
      ],
      differentialEquations: [
        { id: "dynamics", colorId: "color", code: wholePlaceCode },
      ],
    });
    const check = (sdcpn: typeof legacy) => {
      const servers = createLanguageServers();
      try {
        syncLanguageServers(servers, sdcpn);
        return checkSDCPN(sdcpn, servers);
      } finally {
        disposeLanguageServers(servers);
      }
    };
    expect(check(legacy).isValid).toBe(false);
    const migrated = migrateLegacyDynamics(legacy);
    const result = check(migrated);
    expect(result.itemDiagnostics).toEqual([]);
    expect(result.isValid).toBe(true);
  });
});
