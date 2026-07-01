import { describe, expect, it } from "vitest";

import {
  colorForType,
  edgeColorForType,
  primaryTypeOfSet,
  radiusForDegree,
} from "./entity-style";
import { TypeRegistry } from "./stores/type-registry";

import type { TypeIdx } from "../ids";
import type { TypeSchemaEntry } from "./protocol";
import type { VersionedUrl } from "@blockprotocol/type-system";

const url = (slug: string): VersionedUrl =>
  `https://example.com/types/entity-type/${slug}/v/1` as VersionedUrl;

/** Recover the HSL hue (degrees) from an RGB colour, to assert "hue by root". */
function hueOf(color: readonly number[]): number {
  const red = color[0]! / 255;
  const green = color[1]! / 255;
  const blue = color[2]! / 255;
  const max = Math.max(red, green, blue);
  const min = Math.min(red, green, blue);
  const delta = max - min;
  if (delta < 1e-6) {
    return 0;
  }
  let hue: number;
  if (max === red) {
    hue = ((green - blue) / delta) % 6;
  } else if (max === green) {
    hue = (blue - red) / delta + 2;
  } else {
    hue = (red - green) / delta + 4;
  }
  hue *= 60;
  return hue < 0 ? hue + 360 : hue;
}

function buildRegistry(): {
  registry: TypeRegistry;
  company: TypeIdx;
  customer: TypeIdx;
  supplier: TypeIdx;
  person: TypeIdx;
} {
  const company = url("company");
  const customer = url("customer");
  const supplier = url("supplier");
  const person = url("person");

  const schemas: TypeSchemaEntry[] = [
    { url: customer, title: "Customer", allOfRefs: [company] },
    { url: supplier, title: "Supplier", allOfRefs: [company] },
    { url: company, title: "Company", allOfRefs: [] },
    { url: person, title: "Person", allOfRefs: [] },
  ];

  const registry = new TypeRegistry();
  registry.registerAll(schemas);

  return {
    registry,
    company: registry.intern(company),
    customer: registry.intern(customer),
    supplier: registry.intern(supplier),
    person: registry.intern(person),
  };
}

describe("entity-style colour", () => {
  it("picks the most specific type as the primary", () => {
    const { registry, company, customer } = buildRegistry();
    expect(primaryTypeOfSet([company, customer], registry)).toBe(customer);
    expect(primaryTypeOfSet([company], registry)).toBe(company);
  });

  it("gives siblings the SAME family hue but DIFFERENT shades", () => {
    const { registry, customer, supplier } = buildRegistry();
    const customerColor = colorForType(customer, registry);
    const supplierColor = colorForType(supplier, registry);

    // Same root (Company) → same hue; lightness jitter keeps them distinct.
    expect(Math.abs(hueOf(customerColor) - hueOf(supplierColor))).toBeLessThan(
      5,
    );
    expect(customerColor).not.toEqual(supplierColor);
  });

  it("gives different roots clearly different hues", () => {
    const { registry, customer, person } = buildRegistry();
    const customerHue = hueOf(colorForType(customer, registry));
    const personHue = hueOf(colorForType(person, registry));
    expect(Math.abs(customerHue - personHue)).toBeGreaterThan(10);
  });

  it("gives link types enough hue separation to distinguish relationship lanes", () => {
    const hasMember = url("has-member");
    const manages = url("manages");
    const registry = new TypeRegistry();
    registry.registerAll([
      { url: hasMember, title: "Has Member", allOfRefs: [] },
      { url: manages, title: "Manages", allOfRefs: [] },
    ]);

    const firstHue = hueOf(
      edgeColorForType(registry.intern(hasMember), registry),
    );
    const secondHue = hueOf(
      edgeColorForType(registry.intern(manages), registry),
    );

    expect(Math.abs(firstHue - secondHue)).toBeGreaterThan(40);
  });

  it("is deterministic", () => {
    const { registry, customer } = buildRegistry();
    expect(colorForType(customer, registry)).toEqual(
      colorForType(customer, registry),
    );
  });

  it("gives a type the same colour regardless of type arrival order", () => {
    // The reload-consistency bug: colour was keyed off arrival-order intern
    // indices, so the same type drew a different colour depending on the order
    // types streamed in. Two registries with the same types in opposite orders
    // must now produce identical colours.
    const company = url("company");
    const customer = url("customer");
    const person = url("person");

    const forward = new TypeRegistry();
    forward.registerAll([
      { url: customer, title: "Customer", allOfRefs: [company] },
      { url: company, title: "Company", allOfRefs: [] },
      { url: person, title: "Person", allOfRefs: [] },
    ]);

    const reversed = new TypeRegistry();
    reversed.registerAll([
      { url: person, title: "Person", allOfRefs: [] },
      { url: company, title: "Company", allOfRefs: [] },
      { url: customer, title: "Customer", allOfRefs: [company] },
    ]);

    expect(colorForType(forward.intern(customer), forward)).toEqual(
      colorForType(reversed.intern(customer), reversed),
    );
    expect(colorForType(forward.intern(person), forward)).toEqual(
      colorForType(reversed.intern(person), reversed),
    );
  });

  it("falls back to a neutral grey for an unknown type or root", () => {
    const { registry } = buildRegistry();
    expect(colorForType(undefined, registry)).toEqual([126, 142, 160, 220]);
  });

  it("sizes by degree subtly and monotonically", () => {
    const radius0 = radiusForDegree(0);
    const radius5 = radiusForDegree(5);
    const radius50 = radiusForDegree(50);
    expect(radius0).toBeGreaterThan(0);
    expect(radius5).toBeGreaterThan(radius0);
    expect(radius50).toBeGreaterThan(radius5);
    // Subtle: a degree-50 hub is not even 3× a leaf.
    expect(radius50).toBeLessThan(radius0 * 3);
  });
});
