import { describe, expect, it } from "vitest";

import { StringPool } from "../simulation/engine/string-pool";
import {
  computeTokenSlotLayout,
  createTokenRegionViews,
  encodeTokenToBytes,
} from "../simulation/engine/token-layout";
import { compileHirArtifacts } from "./compile";
import { emitUserFunctionJs } from "./emit-js";
import {
  hirDistributionRuntime,
  instantiateHirBufferLambda,
} from "./instantiate";
import { lowerTypeScriptToHir } from "./lower-typescript";

import type { SDCPN, TokenRecord } from "../types/sdcpn";

const sdcpn = {
  types: [
    {
      id: "order",
      name: "Order",
      iconSlug: "circle",
      displayColor: "#00FF00",
      elements: [
        { elementId: "x", name: "x", type: "real" },
        { elementId: "active", name: "active", type: "boolean" },
        { elementId: "status", name: "status", type: "string" },
      ],
    },
  ],
  places: [
    {
      id: "source",
      name: "Source",
      colorId: "order",
      dynamicsEnabled: true,
      differentialEquationId: "dyn",
      x: 0,
      y: 0,
    },
    {
      id: "target",
      name: "Target",
      colorId: "order",
      dynamicsEnabled: false,
      differentialEquationId: null,
      x: 100,
      y: 0,
    },
  ],
  transitions: [
    {
      id: "ship",
      name: "Ship",
      inputArcs: [{ placeId: "source", weight: 1, type: "standard" }],
      outputArcs: [{ placeId: "target", weight: 1 }],
      lambdaType: "predicate",
      lambdaCode: `export default Lambda((input, parameters) =>
  input.Source[0].active && input.Source[0].x >= parameters.threshold
);`,
      transitionKernelCode: `export default TransitionKernel((input, parameters) => ({
  Target: [{
    x: input.Source[0].x + parameters.bump,
    active: false,
    status: "done",
  }],
}));`,
      x: 50,
      y: 0,
    },
  ],
  differentialEquations: [
    {
      id: "dyn",
      name: "Drift",
      colorId: "order",
      code: `export default Dynamics((tokens, parameters) =>
  tokens.map(({ x, active }) => ({
    x: active ? parameters.speed * x : 0,
  }))
);`,
    },
  ],
  parameters: [
    {
      id: "threshold",
      name: "Threshold",
      variableName: "threshold",
      type: "real",
      defaultValue: "2",
    },
    {
      id: "bump",
      name: "Bump",
      variableName: "bump",
      type: "real",
      defaultValue: "1",
    },
    {
      id: "speed",
      name: "Speed",
      variableName: "speed",
      type: "real",
      defaultValue: "0.5",
    },
  ],
  metrics: [
    {
      id: "done-count",
      name: "Done count",
      code: `return state.places.Target.tokens.reduce(
  (count, token) => token.status === "done" ? count + 1 : count,
  0,
);`,
    },
  ],
} satisfies SDCPN;

const orderElements = sdcpn.types[0]!.elements;
const orderLayout = computeTokenSlotLayout(orderElements);

function compile() {
  const { artifacts, failures } = compileHirArtifacts(sdcpn);
  expect(failures).toEqual([]);
  return artifacts;
}

function compileObjectLambda() {
  const lowered = lowerTypeScriptToHir(
    sdcpn.transitions[0]!.lambdaCode,
    "lambda",
  );
  if (!lowered.ok) {
    throw new Error(lowered.diagnostics[0]?.message);
  }
  const source = emitUserFunctionJs(lowered.fn);
  // eslint-disable-next-line no-new-func, @typescript-eslint/no-implied-eval, @typescript-eslint/no-unsafe-call
  return new Function("__dist", `"use strict"; return (${source});`)(
    hirDistributionRuntime,
  ) as (
    input: { Source: TokenRecord[] },
    parameters: { threshold: number },
  ) => unknown;
}

function packToken(token: TokenRecord, pool: StringPool) {
  const bytes = encodeTokenToBytes(orderLayout, token, "test", pool);
  return createTokenRegionViews(bytes.buffer, 0, bytes.byteLength);
}

describe("compileHirArtifacts", () => {
  it("emits stable v4 artifact shapes", () => {
    const artifacts = compile();

    expect({
      version: artifacts.version,
      dynamics: artifacts.dynamics.dyn,
      lambda: artifacts.lambdas.ship,
      kernel: artifacts.kernels.ship,
      metric: artifacts.metrics["done-count"],
    }).toMatchInlineSnapshot(`
      {
        "dynamics": {
          "source": "(placeBytes, numberOfTokens) => {
        "use strict";
        const f64 = new Float64Array(placeBytes.buffer, placeBytes.byteOffset, placeBytes.byteLength >> 3);
        const u64 = new BigUint64Array(placeBytes.buffer, placeBytes.byteOffset, placeBytes.byteLength >> 3);
        const u8 = placeBytes;
        const out = new Float64Array(numberOfTokens * 1);
        for (let __i = 0; __i < numberOfTokens; __i++) {
          const __b = __i * 24;
          out[__i * 1 + 0] = ((u8[__b + 16] !== 0) ? (__params["speed"] * f64[(__b) >> 3]) : 0);
        }
        return out;
      }",
        },
        "kernel": {
          "inputSlotCount": 1,
          "outputByteCount": 24,
          "source": "(f64, u64, u8, placeBases, indices, outF64, outU64, outU8, __sink) => {
        outF64[0] = (f64[(placeBases[0] + indices[0] * 24) >> 3] + __params["bump"]);
        outU8[16] = (false) ? 1 : 0;
        outU64[1] = BigInt(__pool.intern("done"));
      }",
        },
        "lambda": {
          "inputSlotCount": 1,
          "source": "(f64, u64, u8, placeBases, indices) => {
        return ((u8[placeBases[0] + indices[0] * 24 + 16] !== 0) && (f64[(placeBases[0] + indices[0] * 24) >> 3] >= __params["threshold"]));
      }",
        },
        "metric": {
          "placeNames": [
            "Target",
          ],
          "source": "(f64, u64, u8, placeCounts, placeOffsets) => {
        let count = 0;
        { const __n = placeCounts[__places[0]]; const __b = placeOffsets[__places[0]];
          for (let __i = 0; __i < __n; __i++) {
            count = ((__pool.get(Number(u64[(__b + __i * 24 + 8) >> 3])) === "done") ? (count + 1) : count);
          }
        }
        return count;
      }",
        },
        "version": 4,
      }
    `);
  });

  it("matches the object reference emitter for a representative lambda", () => {
    const artifacts = compile();
    const pool = new StringPool();
    const parameters = { threshold: 2 };
    const reference = compileObjectLambda();
    const buffer = instantiateHirBufferLambda(
      artifacts.lambdas.ship!.source,
      parameters,
      pool,
    );
    const placeBases = new Int32Array([0]);
    const indices = new Int32Array([0]);

    for (const token of [
      { x: 3, active: true, status: "queued" },
      { x: 1, active: true, status: "queued" },
      { x: 4, active: false, status: "queued" },
    ]) {
      const views = packToken(token, pool);
      expect(buffer(views.f64, views.u64, views.u8, placeBases, indices)).toBe(
        reference({ Source: [token] }, parameters),
      );
    }
  });
});
