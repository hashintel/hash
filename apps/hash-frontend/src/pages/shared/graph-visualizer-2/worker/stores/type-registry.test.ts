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

    // Customer is listed first, so processing its `allOfRefs` interns `company`
    // as a bare ref — giving the parent a HIGHER idx than the child. The roots
    // computation must not depend on that ordering.
    const schemas: TypeSchemaEntry[] = [
      { url: customer, title: "Customer", allOfRefs: [company] },
      { url: company, title: "Company", allOfRefs: [] },
    ];

    const registry = new TypeRegistry();
    registry.registerAll(schemas);

    const customerIdx = registry.intern(customer);
    const companyIdx = registry.intern(company);

    expect(customerIdx).toBeLessThan(companyIdx);
    expect(registry.get(companyIdx)?.rootIdxs).toEqual([companyIdx]);
    expect(registry.get(customerIdx)?.rootIdxs).toEqual([companyIdx]);
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

    const companyIdx = registry.intern(company);
    expect(registry.get(registry.intern(customer))?.rootIdxs).toEqual([
      companyIdx,
    ]);
    expect(registry.get(registry.intern(supplier))?.rootIdxs).toEqual([
      companyIdx,
    ]);
  });

  it("resolves a multi-level chain to the topmost ancestor", () => {
    const customer = url("customer");
    const company = url("company");
    const actor = url("actor");

    // Transitive over-approximation (child points at ALL ancestors) plus a
    // deeper chain — the topmost parentless type must win.
    const schemas: TypeSchemaEntry[] = [
      { url: customer, title: "Customer", allOfRefs: [company, actor] },
      { url: company, title: "Company", allOfRefs: [actor] },
      { url: actor, title: "Actor", allOfRefs: [] },
    ];

    const registry = new TypeRegistry();
    registry.registerAll(schemas);

    const actorIdx = registry.intern(actor);
    expect(registry.get(registry.intern(customer))?.rootIdxs).toEqual([
      actorIdx,
    ]);
  });
});

describe("TypeRegistry colour slots", () => {
  it("assigns slots sorted by base URL within a batch", () => {
    const customer = url("customer");
    const supplier = url("supplier");
    const company = url("company");

    // Arrival order (customer, supplier, company) differs from sorted order
    // (company, customer, supplier) — the slot follows the SORT, not arrival.
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

    // The first batch keeps its slot; the second is appended, sorted within
    // itself (actor < person), so existing colours never shift on expansion.
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
