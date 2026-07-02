import { describe, expect, it } from "vitest";

import {
  mergeClosedMultiEntityTypesRootMaps,
  mergeDefinitions,
} from "./merge-page-data";

import type { ClosedMultiEntityTypeMap } from "@local/hash-graph-client";
import type { ClosedMultiEntityTypesDefinitions } from "@local/hash-graph-sdk/ontology";

const schemaFor = (label: string) =>
  ({ label }) as unknown as ClosedMultiEntityTypeMap["schema"];

describe("mergeClosedMultiEntityTypesRootMaps", () => {
  it("returns a single map unchanged (same reference)", () => {
    const map = { typeA: { schema: schemaFor("A") } };

    expect(mergeClosedMultiEntityTypesRootMaps([map])).toBe(map);
  });

  it("merges nested branches recursively", () => {
    const first = {
      typeA: {
        schema: schemaFor("A"),
        inner: { typeB: { schema: schemaFor("A+B") } },
      },
    };

    const second = {
      typeA: {
        schema: schemaFor("A"),
        inner: { typeC: { schema: schemaFor("A+C") } },
      },
      typeD: { schema: schemaFor("D") },
    };

    const merged = mergeClosedMultiEntityTypesRootMaps([first, second]);

    expect(Object.keys(merged).toSorted()).toEqual(["typeA", "typeD"]);
    expect(Object.keys(merged.typeA!.inner!).toSorted()).toEqual([
      "typeB",
      "typeC",
    ]);
    expect(merged.typeA!.inner!.typeB!.schema).toBe(
      first.typeA.inner.typeB.schema,
    );
    expect(merged.typeA!.inner!.typeC!.schema).toBe(
      second.typeA.inner.typeC.schema,
    );
    expect(merged.typeD!.schema).toBe(second.typeD.schema);
  });
});

describe("mergeDefinitions", () => {
  it("returns a single definition set unchanged (same reference)", () => {
    const definitions = {
      dataTypes: {},
      entityTypes: {},
      propertyTypes: {},
    } as ClosedMultiEntityTypesDefinitions;

    expect(mergeDefinitions([definitions])).toBe(definitions);
  });

  it("unions each definition pool, later pages winning on conflicts", () => {
    const dataTypeA = { name: "a" };
    const dataTypeB = { name: "b" };
    const dataTypeBNewer = { name: "b-newer" };
    const propertyType = { name: "p" };
    const entityType = { name: "e" };

    const first = {
      dataTypes: { "https://a/": dataTypeA, "https://b/": dataTypeB },
      entityTypes: {},
      propertyTypes: { "https://p/": propertyType },
    } as unknown as ClosedMultiEntityTypesDefinitions;

    const second = {
      dataTypes: { "https://b/": dataTypeBNewer },
      entityTypes: { "https://e/": entityType },
      propertyTypes: {},
    } as unknown as ClosedMultiEntityTypesDefinitions;

    const merged = mergeDefinitions([first, second]);

    expect(merged.dataTypes).toEqual({
      "https://a/": dataTypeA,
      "https://b/": dataTypeBNewer,
    });
    expect(merged.entityTypes).toEqual({ "https://e/": entityType });
    expect(merged.propertyTypes).toEqual({ "https://p/": propertyType });
  });
});
