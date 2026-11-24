import { describe, expect, it, test } from "@effect/vitest";
import {
  Array,
  Effect,
  Equal,
  Hash,
  Inspectable,
  MutableHashMap,
  Option,
} from "effect";

import { cases } from "../../tests/fixtures/node-cases.js";
import * as AST from "./index.js";

const opaqueCases = Array.getSomes(
  Array.map(cases, (fixture) =>
    fixture.trapped.pipe(Option.map((make) => ({ name: fixture.name, make }))),
  ),
);

describe("node", () => {
  describe.each(cases)("$name", (fixture) => {
    test("equal_fields", () => {
      expect.hasAssertions();
      const first = fixture.make();
      const second = fixture.make();
      expect(first).not.toBe(second);
      expect(Object.isFrozen(first)).toBe(true);
      expect(Equal.equals(first, second)).toBe(true);
      expect(first[Equal.symbol](second)).toBe(true);
      expect(Hash.hash(first)).toBe(Hash.hash(second));
    });

    test.each(fixture.changes)("changed_$field", (change) => {
      expect.hasAssertions();
      const first = fixture.make();
      const changed = change.make();
      // Call the protocol directly: different hashes must not hide an omitted equality field.
      expect(first[Equal.symbol](changed)).toBe(false);
      expect(Equal.equals(first, changed)).toBe(false);
    });

    test("map_lookup", () => {
      expect.hasAssertions();
      const map = MutableHashMap.empty();
      MutableHashMap.set(map, fixture.make(), 7);
      expect(MutableHashMap.get(map, fixture.make())).toStrictEqual(
        Option.some(7),
      );
    });

    it.effect(
      "intern_identity",
      Effect.fnUntraced(function* () {
        expect.hasAssertions();
        const ast = AST.make();
        const first = fixture.make();
        const id = yield* ast.intern(first);
        const again = yield* ast.intern(fixture.make());
        expect(again).toBe(id);
        expect(ast.get(id)).toBe(first);
      }),
    );

    test("documentation_absent", () => {
      expect.hasAssertions();
      expect(fixture.make()).toHaveProperty("documentation", Option.none());
    });

    test("pipe_and_inspect", () => {
      expect.hasAssertions();
      const node = fixture.make();
      expect(node.pipe((value) => value._tag)).toBe(node._tag);
      expect(node[Inspectable.NodeInspectSymbol]()).toStrictEqual(
        node.toJSON(),
      );
      expect(node.toString()).toContain(node._tag);
    });
  });

  test.each(opaqueCases)("opaque_$name", ({ make }) => {
    expect.hasAssertions();
    const node = make();
    expect(() => Hash.hash(node)).not.toThrow();
    expect(node[Equal.symbol](node)).toBe(true);
    expect(() => node.toString()).not.toThrow();
  });

  test("distinct_kinds", () => {
    expect.hasAssertions();
    const first = Array.head(cases).pipe(Option.getOrThrow).make();
    const second = Array.get(cases, 1).pipe(Option.getOrThrow).make();
    expect(Equal.equals(first, second)).toBe(false);
  });
});
