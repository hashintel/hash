import { describe, expect, it } from "vitest";
import { z } from "zod";

import { findUnknownKeys, keyTreeOf } from "./key-tree";
import { legacySdcpnFileSchema, sdcpnFileSchema } from "./types";

import type { KeyTree } from "./key-tree";

const item = z.object({ name: z.string() });

describe("keyTreeOf", () => {
  it("names the keys of an object and of the objects beneath it", () => {
    const schema = z.object({
      id: z.string(),
      owner: z.object({ email: z.string() }),
      items: z.array(item),
    });

    expect(keyTreeOf(schema)).toEqual({
      id: true,
      owner: { email: true },
      items: { name: true },
    });
  });

  it.each([
    ["optional", item.optional()],
    ["nullable", item.nullable()],
    ["default", item.default({ name: "" })],
    ["prefault", item.prefault({ name: "" })],
    ["nonoptional", item.optional().nonoptional()],
    ["readonly", item.readonly()],
    ["catch", item.catch({ name: "" })],
  ])("reads through .%s()", (_wrapper, schema) => {
    expect(keyTreeOf(schema)).toEqual({ name: true });
  });

  it("names the keys of an object that rejects other keys", () => {
    expect(keyTreeOf(z.strictObject({ name: z.string() }))).toEqual({
      name: true,
    });
  });

  it.each([
    ["an object that keeps other keys", z.looseObject({ name: z.string() })],
    ["an object with a catch-all", item.catchall(z.string())],
    ["a record", z.record(z.string(), item)],
    ["a union", z.union([item, z.string()])],
    ["a value without keys", z.string()],
  ])("checks nothing beneath %s", (_kind, schema) => {
    expect(keyTreeOf(schema)).toBe(true);
  });
});

describe("findUnknownKeys", () => {
  const keys: KeyTree = {
    title: true,
    metadata: true,
    places: { id: true, arcs: { weight: true } },
  };

  it("reports nothing for a document that uses only defined keys", () => {
    expect(
      findUnknownKeys(keys, {
        title: "Net",
        places: [{ id: "p1", arcs: [{ weight: 1 }] }],
      }),
    ).toEqual([]);
  });

  it("reports the path of an unknown key at every depth, in document order", () => {
    expect(
      findUnknownKeys(keys, {
        title: "Net",
        fusions: [{ id: "f1" }],
        places: [
          { id: "p1" },
          { id: "p2", portDirection: "in", arcs: [{ weight: 1, label: "a" }] },
        ],
      }),
    ).toEqual([
      ["fusions"],
      ["places", 1, "portDirection"],
      ["places", 1, "arcs", 0, "label"],
    ]);
  });

  it("reports an unknown key once, without the keys beneath it", () => {
    expect(
      findUnknownKeys(keys, { layout: { nodes: [{ x: 1, y: 2 }] } }),
    ).toEqual([["layout"]]);
  });

  it("checks nothing beneath a key mapped to `true`", () => {
    expect(
      findUnknownKeys(keys, { metadata: { anything: { goes: [1] } } }),
    ).toEqual([]);
  });

  it.each([
    ["undefined", undefined],
    ["null", null],
    ["an empty array", []],
    ["an empty object", {}],
  ])("leaves out an unknown key that holds %s", (_label, held) => {
    expect(findUnknownKeys(keys, { title: "Net", fusions: held })).toEqual([]);
  });

  it.each([
    ["false", false],
    ["zero", 0],
    ["an empty string", ""],
  ])("reports an unknown key that holds %s", (_label, held) => {
    expect(findUnknownKeys(keys, { fusions: held })).toEqual([["fusions"]]);
  });

  it("reports a key that only `Object.prototype` defines", () => {
    const document: unknown = JSON.parse(
      '{ "constructor": 1, "toString": 2, "__proto__": 3 }',
    );

    expect(findUnknownKeys(keys, document)).toEqual([
      ["constructor"],
      ["toString"],
      ["__proto__"],
    ]);
  });

  it.each([
    ["a string", "text"],
    ["a number", 3],
    ["null", null],
  ])("reports nothing for %s in place of a document", (_label, document) => {
    expect(findUnknownKeys(keys, document)).toEqual([]);
  });
});

type ObjectKeys = { path: string[]; keys: string[] };

/**
 * The keys of every object `schema` reaches that drops the keys it does not
 * define, with the object keys that lead to it. Unlike `keyTreeOf`, this
 * follows every kind of schema.
 */
const objectsThatDropKeys = (
  schema: z.core.$ZodType,
  path: string[] = [],
  ancestors: ReadonlySet<z.core.$ZodType> = new Set(),
): ObjectKeys[] => {
  if (ancestors.has(schema)) {
    return [];
  }
  const within = new Set(ancestors).add(schema);
  const def = (schema as z.core.$ZodTypes)._zod.def;

  if (def.type === "object") {
    return [
      ...(def.catchall ? [] : [{ path, keys: Object.keys(def.shape) }]),
      ...Object.entries(def.shape).flatMap(([key, property]) =>
        objectsThatDropKeys(property, [...path, key], within),
      ),
    ];
  }

  const beneath =
    def.type === "lazy"
      ? [def.getter()]
      : Object.values(def)
          .flat()
          .filter((value) => value instanceof z.core.$ZodType);
  return beneath.flatMap((inner) => objectsThatDropKeys(inner, path, within));
};

const treeAt = (tree: KeyTree | true, path: string[]): KeyTree | true =>
  path.reduce<KeyTree | true>(
    (beneath, key) => (beneath === true ? true : (beneath[key] ?? true)),
    tree,
  );

describe.each([
  ["versioned", sdcpnFileSchema],
  ["legacy", legacySdcpnFileSchema],
])("the key tree of the %s file schema", (_format, schema) => {
  const tree = keyTreeOf(schema);
  const objects = objectsThatDropKeys(schema);

  it("finds the objects of the schema that drop keys", () => {
    expect(objects.length).toBeGreaterThan(10);
  });

  it.each(
    objects.map((object) => ({
      ...object,
      at: object.path.join(".") || "the root",
    })),
  )("names the keys of the object at $at", ({ path, keys }) => {
    const beneath = treeAt(tree, path);

    expect(
      beneath === true ? null : Object.keys(beneath),
      "keyTreeOf does not reach this object, so import would drop its unknown keys without reporting them",
    ).toEqual(keys);
  });
});
