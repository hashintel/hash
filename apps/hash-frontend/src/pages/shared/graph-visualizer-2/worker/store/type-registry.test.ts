// eslint-disable-next-line import/no-extraneous-dependencies
import { describe, expect, it } from "vitest";

import { TypeRegistry } from "./type-registry";

import type { TypeSchemaEntry } from "../protocol";
import type { VersionedUrl } from "@blockprotocol/type-system";

const url = (slug: string): VersionedUrl =>
  `https://example.com/types/entity-type/${slug}/v/1` as VersionedUrl;

describe("TypeRegistry root resolution", () => {
  it("resolves a child's root when the child is interned BEFORE its parent", () => {
    const customer = url("customer");
    const company = url("company");

    const schemas: TypeSchemaEntry[] = [
      { url: customer, title: "Customer", allOfRefs: [company] },
      { url: company, title: "Company", allOfRefs: [] },
    ];

    const registry = new TypeRegistry();
    registry.registerAll(schemas);

    const customerId = registry.intern(customer);
    const companyId = registry.intern(company);

    expect(customerId).toBeLessThan(companyId);
    expect(registry.get(companyId)?.rootIds).toEqual([companyId]);
    expect(registry.get(customerId)?.rootIds).toEqual([companyId]);
  });

  it("resolves the SAME root for siblings so they bucket together", () => {
    const customer = url("customer");
    const supplier = url("supplier");
    const company = url("company");

    const schemas: TypeSchemaEntry[] = [
      { url: customer, title: "Customer", allOfRefs: [company] },
      { url: supplier, title: "Supplier", allOfRefs: [company] },
      { url: company, title: "Company", allOfRefs: [] },
    ];

    const registry = new TypeRegistry();
    registry.registerAll(schemas);

    const companyId = registry.intern(company);
    expect(registry.get(registry.intern(customer))?.rootIds).toEqual([
      companyId,
    ]);
    expect(registry.get(registry.intern(supplier))?.rootIds).toEqual([
      companyId,
    ]);
  });

  it("resolves a multi-level chain to the topmost ancestor", () => {
    const customer = url("customer");
    const company = url("company");
    const actor = url("actor");

    const schemas: TypeSchemaEntry[] = [
      { url: customer, title: "Customer", allOfRefs: [company, actor] },
      { url: company, title: "Company", allOfRefs: [actor] },
      { url: actor, title: "Actor", allOfRefs: [] },
    ];

    const registry = new TypeRegistry();
    registry.registerAll(schemas);

    const actorId = registry.intern(actor);
    expect(registry.get(registry.intern(customer))?.rootIds).toEqual([actorId]);
  });
});

describe("TypeRegistry colour slots", () => {
  it("assigns slots sorted by base URL within a batch", () => {
    const customer = url("customer");
    const supplier = url("supplier");
    const company = url("company");

    const registry = new TypeRegistry();
    registry.registerAll([
      { url: customer, title: "Customer", allOfRefs: [company] },
      { url: supplier, title: "Supplier", allOfRefs: [company] },
      { url: company, title: "Company", allOfRefs: [] },
    ]);

    expect(registry.colorSlot(registry.intern(company))).toBe(0);
    expect(registry.colorSlot(registry.intern(customer))).toBe(1);
    expect(registry.colorSlot(registry.intern(supplier))).toBe(2);
  });

  it("appends new batches without re-slotting existing types", () => {
    const company = url("company");
    const person = url("person");
    const actor = url("actor");

    const registry = new TypeRegistry();
    registry.registerAll([{ url: company, title: "Company", allOfRefs: [] }]);
    const companySlot = registry.colorSlot(registry.intern(company));

    registry.registerAll([
      { url: person, title: "Person", allOfRefs: [] },
      { url: actor, title: "Actor", allOfRefs: [] },
    ]);

    expect(registry.colorSlot(registry.intern(company))).toBe(companySlot);
    expect(registry.colorSlot(registry.intern(actor))).toBe(1);
    expect(registry.colorSlot(registry.intern(person))).toBe(2);
  });

  it("gives identical slots regardless of arrival order (reload stability)", () => {
    const customer = url("customer");
    const supplier = url("supplier");
    const company = url("company");

    const forward = new TypeRegistry();
    forward.registerAll([
      { url: customer, title: "Customer", allOfRefs: [company] },
      { url: supplier, title: "Supplier", allOfRefs: [company] },
      { url: company, title: "Company", allOfRefs: [] },
    ]);

    const reversed = new TypeRegistry();
    reversed.registerAll([
      { url: company, title: "Company", allOfRefs: [] },
      { url: supplier, title: "Supplier", allOfRefs: [company] },
      { url: customer, title: "Customer", allOfRefs: [company] },
    ]);

    for (const typeUrl of [company, customer, supplier]) {
      expect(forward.colorSlot(forward.intern(typeUrl))).toBe(
        reversed.colorSlot(reversed.intern(typeUrl)),
      );
    }
  });
});
