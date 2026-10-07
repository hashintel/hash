import { describe, expect, it } from "vitest";

import {
  hashPetrinautDocument,
  petrinautNonSemanticParts,
  type PetrinautNonSemanticPart,
} from "./hash-petrinaut-document";

import type { Place, SDCPN } from "../types/sdcpn";

const place = (id: string, name: string): Place => ({
  id,
  name,
  description: undefined,
  colorId: null,
  dynamicsEnabled: false,
  differentialEquationId: null,
  x: 0,
  y: 0,
});

const net: SDCPN = {
  description: "Two places",
  metadata: { owner: "demo" },
  places: [place("place-a", "Waiting"), place("place-b", "Served")],
  transitions: [],
  types: [
    {
      id: "color-job",
      name: "Job",
      iconSlug: "circle",
      displayColor: "#FF0000",
      elements: [],
    },
  ],
  differentialEquations: [],
  parameters: [],
  subnets: [
    {
      id: "subnet-1",
      name: "Inner",
      places: [place("place-inner", "Inner")],
      transitions: [],
      types: [],
      differentialEquations: [],
      parameters: [],
    },
  ],
};

const renamed: SDCPN = {
  ...net,
  places: net.places.map((item) => ({ ...item, name: `${item.name}!` })),
};

describe("hashPetrinautDocument", () => {
  it("ignores the order of object keys", () => {
    const reordered: SDCPN = {
      ...net,
      places: net.places.map(
        (item) => Object.fromEntries(Object.entries(item).reverse()) as Place,
      ),
    };

    expect(hashPetrinautDocument(reordered)).toBe(hashPetrinautDocument(net));
  });

  it("keeps the order of array items", () => {
    expect(
      hashPetrinautDocument({ ...net, places: net.places.toReversed() }),
    ).not.toBe(hashPetrinautDocument(net));
  });

  it("hashes a net like its JSON round trip", () => {
    expect(
      hashPetrinautDocument(JSON.parse(JSON.stringify(net)) as SDCPN),
    ).toBe(hashPetrinautDocument(net));
  });

  it("changes with what the net simulates, whatever is excluded", () => {
    const semantic = { exclude: petrinautNonSemanticParts };

    expect(hashPetrinautDocument(renamed)).not.toBe(hashPetrinautDocument(net));
    expect(hashPetrinautDocument(renamed, semantic)).not.toBe(
      hashPetrinautDocument(net, semantic),
    );
  });

  const changes: Record<PetrinautNonSemanticPart, (input: SDCPN) => SDCPN> = {
    layout: (input) => ({
      ...input,
      subnets: input.subnets?.map((subnet) => ({
        ...subnet,
        places: subnet.places.map((item) => ({ ...item, x: item.x + 40 })),
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
});
