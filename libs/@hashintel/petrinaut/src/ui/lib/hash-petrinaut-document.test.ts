import { createHash } from "node:crypto";

import { describe, expect, it } from "vitest";

import {
  hashPetrinautDocument,
  petrinautNonSemanticParts,
  type PetrinautNonSemanticPart,
} from "./hash-petrinaut-document";

import type { SDCPN } from "@hashintel/petrinaut-core";

const hash = (value: unknown): string => hashPetrinautDocument(value as SDCPN);

const net: SDCPN = {
  description: "Two-place handover",
  metadata: { owner: "demo", tags: ["queue", "handover"] },
  places: [
    {
      id: "place-a",
      name: "Waiting",
      description: undefined,
      colorId: "color-job",
      dynamicsEnabled: false,
      differentialEquationId: null,
      capacity: null,
      x: -120.5,
      y: 0,
    },
    {
      id: "place-b",
      name: "Served",
      colorId: null,
      dynamicsEnabled: false,
      differentialEquationId: null,
      x: 180,
      y: 1e21,
    },
  ],
  transitions: [
    {
      id: "transition-serve",
      name: "Serve",
      inputArcs: [{ placeId: "place-a", weight: 1, type: "standard" }],
      outputArcs: [
        { endpoint: { kind: "place", placeId: "place-b" }, weight: 2 },
      ],
      lambdaType: "stochastic",
      lambdaCode: "return 0.5;",
      transitionKernelCode: 'return { Served: [{ label: "é\\n" }] };',
      x: 30,
      y: 0.1,
    },
  ],
  types: [
    {
      id: "color-job",
      name: "Job",
      iconSlug: "circle",
      displayColor: "#FF0000",
      elements: [{ elementId: "element-1", name: "label", type: "string" }],
    },
  ],
  differentialEquations: [],
  parameters: [
    {
      id: "parameter-rate",
      name: "Rate",
      variableName: "rate",
      type: "real",
      defaultValue: "0.5",
    },
  ],
  scenarios: [
    {
      id: "scenario-1",
      name: "Busy",
      scenarioParameters: [],
      parameterOverrides: { "parameter-rate": "2" },
      initialState: {
        type: "per_place",
        content: { "place-a": [["first"], ["second"]], "place-b": "0" },
      },
    },
  ],
  subnets: [
    {
      id: "subnet-1",
      name: "Inner",
      places: [
        {
          id: "place-inner",
          name: "Inner",
          colorId: null,
          dynamicsEnabled: false,
          differentialEquationId: null,
          x: 0,
          y: 0,
        },
      ],
      transitions: [],
      types: [],
      differentialEquations: [],
      parameters: [],
    },
  ],
};

describe("hashPetrinautDocument", () => {
  it("ignores the order of object keys, nested and integer-like ones too", () => {
    expect(hash({ b: 1, a: { d: [1, 2], c: "x" } })).toBe(
      hash({ a: { c: "x", d: [1, 2] }, b: 1 }),
    );
    expect(hash({ "10": "ten", "2": "two", B: 1, a: 2 })).toBe(
      hash({ a: 2, B: 1, "2": "two", "10": "ten" }),
    );
  });

  it("keeps the order of array items", () => {
    expect(hash({ items: [1, 2, 3] })).not.toBe(hash({ items: [3, 2, 1] }));
    expect(hash({ items: [{ id: "a" }, { id: "b" }] })).not.toBe(
      hash({ items: [{ id: "b" }, { id: "a" }] }),
    );
  });

  it("drops undefined-valued and function-valued keys", () => {
    expect(hash({ a: 1, b: undefined, c: () => 1 })).toBe(hash({ a: 1 }));
  });

  it("hashes undefined and functions in an array like null", () => {
    expect(hash({ items: [1, undefined, () => 1] })).toBe(
      hash({ items: [1, null, null] }),
    );
  });

  it("hashes holes in a sparse array like null", () => {
    const sparse = new Array<unknown>(3);
    sparse[0] = 1;
    sparse[2] = 3;
    expect(hash({ items: sparse })).toBe(hash({ items: [1, null, 3] }));
    expect(hash({ items: sparse })).toBe(
      hash(JSON.parse(JSON.stringify({ items: sparse }))),
    );
    expect(hash({ items: new Array<unknown>(1) })).not.toBe(
      hash({ items: [] }),
    );
  });

  it("hashes NaN and infinities like null, and -0 like 0", () => {
    expect(hash({ items: [NaN, Infinity, -Infinity], value: NaN })).toBe(
      hash({ items: [null, null, null], value: null }),
    );
    expect(hash({ value: -0 })).toBe(hash({ value: 0 }));
  });

  it("hashes a value with toJSON like its toJSON result", () => {
    expect(hash({ when: new Date(0) })).toBe(
      hash({ when: "1970-01-01T00:00:00.000Z" }),
    );
    expect(hash({ value: { toJSON: () => ({ b: 1, a: 2 }) } })).toBe(
      hash({ value: { a: 2, b: 1 } }),
    );
    expect(hash({ field: { toJSON: (key: string) => key } })).toBe(
      hash({ field: "field" }),
    );
  });

  it("hashes a net like its JSON round trip", () => {
    expect(hashPetrinautDocument(net)).toBe(
      hashPetrinautDocument(JSON.parse(JSON.stringify(net)) as SDCPN),
    );
  });

  it("gives different content different hashes", () => {
    const renamed: SDCPN = {
      ...net,
      places: net.places.map((place) =>
        place.id === "place-b" ? { ...place, name: "Done" } : place,
      ),
    };
    expect(hashPetrinautDocument(renamed)).not.toBe(hashPetrinautDocument(net));
    expect(hash({ value: 1 })).not.toBe(hash({ value: "1" }));
  });

  it("is the SHA-256 of the canonical JSON in lowercase hex", () => {
    const expected = (canonical: string) =>
      createHash("sha256").update(canonical, "utf8").digest("hex");

    expect(hash({ b: 1, a: [true, null, "x"] })).toBe(
      expected('{"a":[true,null,"x"],"b":1}'),
    );
    expect(
      hash({ z: "é", y: 0.1, x: { "2": 2, "10": 1 }, a: null, B: false }),
    ).toBe(expected('{"B":false,"a":null,"x":{"10":1,"2":2},"y":0.1,"z":"é"}'));
    expect(hashPetrinautDocument(net)).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe("hashPetrinautDocument exclusions", () => {
  const changes: Record<PetrinautNonSemanticPart, (input: SDCPN) => SDCPN> = {
    layout: (input) => ({
      ...input,
      subnets: input.subnets?.map((subnet) => ({
        ...subnet,
        places: subnet.places.map((place) => ({ ...place, x: place.x + 40 })),
      })),
    }),
    descriptions: (input) => ({ ...input, description: "Changed" }),
    appearance: (input) => ({
      ...input,
      types: input.types.map((type) => ({ ...type, displayColor: "#00FF00" })),
    }),
    metadata: (input) => ({ ...input, metadata: {} }),
  };

  it.each(petrinautNonSemanticParts)("leaves out %s when excluded", (part) => {
    const changed = changes[part](net);

    expect(hashPetrinautDocument(changed)).not.toBe(hashPetrinautDocument(net));
    expect(hashPetrinautDocument(changed, { exclude: [part] })).toBe(
      hashPetrinautDocument(net, { exclude: [part] }),
    );
  });

  it("still hashes what the net simulates", () => {
    const semantic = { exclude: petrinautNonSemanticParts };
    const renamed: SDCPN = {
      ...net,
      places: net.places.map((place) => ({ ...place, name: `${place.name}!` })),
    };

    expect(hashPetrinautDocument(renamed, semantic)).not.toBe(
      hashPetrinautDocument(net, semantic),
    );
  });
});
