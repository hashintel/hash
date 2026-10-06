/** @vitest-environment jsdom */
import { describe, expect, test, vi } from "vitest";

import { documentRevisionOf } from "./document-revision";

import type { SDCPN } from "@hashintel/petrinaut-core";

// The Petrinaut UI package that hashes the content reads browser capabilities
// while its modules load.
await vi.hoisted(async () => {
  const { installPetrinautDomShims } =
    await import("../../shared/petrinaut-jsdom");
  installPetrinautDomShims();
});

const emptyDefinition: SDCPN = {
  places: [],
  transitions: [],
  types: [],
  parameters: [],
  differentialEquations: [],
};

const placedDefinition: SDCPN = {
  ...emptyDefinition,
  places: [
    {
      id: "place-1",
      name: "Place",
      x: 0,
      y: 0,
      colorId: null,
      dynamicsEnabled: false,
      differentialEquationId: null,
    },
  ],
};

describe("documentRevisionOf", () => {
  test("is a SHA-256 hex digest", () => {
    expect(documentRevisionOf(emptyDefinition)).toMatch(/^[0-9a-f]{64}$/u);
  });

  test("gives equal content the same revision", () => {
    const roundTripped = JSON.parse(JSON.stringify(placedDefinition)) as SDCPN;
    const reordered: SDCPN = {
      differentialEquations: [],
      parameters: [],
      types: [],
      transitions: [],
      places: placedDefinition.places,
    };

    expect(documentRevisionOf(roundTripped)).toBe(
      documentRevisionOf(placedDefinition),
    );
    expect(documentRevisionOf(reordered)).toBe(
      documentRevisionOf(placedDefinition),
    );
  });

  test("gives different content different revisions", () => {
    expect(documentRevisionOf(placedDefinition)).not.toBe(
      documentRevisionOf(emptyDefinition),
    );
  });
});
