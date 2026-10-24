import { beforeAll, expect, expectTypeOf, test } from "vitest";

import { RustDocument } from "../../rust/pkg/petrinaut_core.js";
import { readRustWasm } from "../../scripts/read-rust-wasm.mjs";
import { DEFAULT_PETRINAUT_EXTENSIONS } from "../extensions";
import { normalizeSDCPN } from "../types/sdcpn-input";
import { initializePetrinautRust } from "./index";

import type { Sdcpn } from "../../rust/pkg/petrinaut_core.js";
import type { SDCPN } from "../types/sdcpn";
import type { SDCPNInput } from "../types/sdcpn-input";

beforeAll(async () => {
  await initializePetrinautRust(await readRustWasm());
});

const createNative = (initial: unknown) =>
  new RustDocument(
    JSON.stringify(initial),
    50,
    "initial",
    false,
    JSON.stringify(DEFAULT_PETRINAUT_EXTENSIONS),
  );

test("generated Rust document declarations match the public TypeScript model", () => {
  expectTypeOf<Sdcpn>().toExtend<SDCPN>();
  expectTypeOf<SDCPN>().toExtend<Sdcpn>();
});

test("normalizes native input without the TypeScript adapter and preserves opaque metadata", () => {
  const initial: SDCPNInput = {
    places: [{ id: "queue", name: "Queue", x: 0, y: 0, capacity: null }],
    transitions: [
      {
        id: "move",
        name: "Move",
        x: 0,
        y: 0,
        inputArcs: [{ placeId: "queue" }],
        outputArcs: [],
      },
    ],
    metadata: { id: "host-owned", nested: { colorId: "host-color" } },
  };
  const native = createNative(initial);
  try {
    expect(JSON.parse(native.snapshot())).toEqual(normalizeSDCPN(initial));
    expect(JSON.parse(native.snapshot()).places[0]).not.toHaveProperty(
      "description",
    );
  } finally {
    native.free();
  }
});

test.each([
  {
    places: [{ id: "p", name: "Queue", x: 0, y: 0, capacity: 0.5 }],
    transitions: [],
  },
  {
    places: [],
    transitions: [],
    parameters: [
      {
        id: "p",
        name: "Rate",
        variableName: "rate",
        type: "integer",
        defaultValue: "0.5",
      },
    ],
  },
  {
    places: [],
    transitions: [],
    types: [
      {
        id: "type",
        name: "Token",
        iconSlug: "circle",
        displayColor: "red",
        elements: [{ elementId: "e", name: "constructor", type: "real" }],
      },
    ],
  },
  {
    places: [],
    transitions: [],
    scenarios: [
      {
        id: "s",
        name: "Scenario",
        parameterOverrides: {},
        scenarioParameters: [
          { identifier: "rate", type: "real", default: 1 },
          { identifier: "rate", type: "real", default: 2 },
        ],
        initialState: { type: "code", content: "return {};" },
      },
    ],
  },
  { places: [], transitions: [], unknownField: true },
])(
  "rejects malformed native documents and replacements atomically: %j",
  (invalid) => {
    expect(() => createNative(invalid)).toThrow();
    const native = createNative({ places: [], transitions: [] });
    try {
      const baseline = native.snapshot();
      expect(() => native.commit(JSON.stringify(invalid), "invalid")).toThrow();
      expect(native.snapshot()).toBe(baseline);
      expect(JSON.parse(native.history()).currentIndex).toBe(0);
    } finally {
      native.free();
    }
  },
);
