import { Array, HashMap, Option, pipe } from "effect";
import { beforeAll, describe, expect, test } from "vitest";

import * as Entry from "../src/Entry.js";
import * as Tree from "../src/Tree/index.js";
import * as TypeScript from "../src/TypeScript/index.js";
import * as Reference from "./fixtures/reference.js";

let loaded: Reference.Reference | null = null;
const reference = (): Reference.Reference =>
  Option.fromNullishOr(loaded).pipe(Option.getOrThrow);

const ownOf = (name: string): Tree.Export.Own =>
  HashMap.get(
    reference().document.entries,
    Reference.id(reference(), [name]),
  ).pipe(Option.getOrThrow);

const summaryOf = (comment: Tree.Comment.Comment): Option.Option<string> =>
  Option.flatMap(comment.description, ({ children }) =>
    Tree.Prose.plain(children),
  );

/** Each comment's summary with the overloads it documents. */
const summaries = ({
  comments,
}: {
  readonly comments: readonly Tree.Comment.Comment[];
}): readonly (readonly [Option.Option<string>, readonly number[]])[] =>
  Array.map(comments, (comment) => [
    summaryOf(comment),
    comment.applies.overloads,
  ]);

const numbersOf = (
  signatures: Option.Option<Tree.Declaration.Signatures>,
): readonly (readonly number[])[] =>
  pipe(
    Option.toArray(signatures),
    Array.flatMap(({ children }) => children),
    Array.map(({ overloads }) => Array.map(overloads, ({ index }) => index)),
  );

describe("entry", () => {
  beforeAll(async () => {
    loaded = await Reference.success({ source: Reference.source });
  });

  test("source_owned_comments", () => {
    expect.hasAssertions();
    const own = ownOf("choose");
    expect(summaries(own)).toStrictEqual([
      [Option.some("First call."), [1]],
      [Option.some("Second call."), [2]],
    ]);
    expect(numbersOf(own.signatures)).toStrictEqual([[1], [2]]);
  });

  test("deprecation_and_examples", () => {
    expect.hasAssertions();
    expect(ownOf("choose").deprecated).toBe(false);
    expect(ownOf("old").deprecated).toBe(true);
    const [first] = ownOf("choose").comments;
    expect(first?.examples).toHaveLength(1);
    expect(
      Option.map(
        Option.flatMap(
          Option.fromUndefinedOr(first),
          ({ facts }) => facts.since,
        ),
        ({ version }) => version,
      ),
    ).toStrictEqual(Option.some("1.0.0"));
  });

  test("call_comments_and_container", () => {
    expect.hasAssertions();
    const own = ownOf("callable");
    expect(summaries(own)).toStrictEqual([
      [Option.some("Container docs."), [1, 2]],
      [Option.some("Inner call."), [1]],
    ]);
    expect(numbersOf(own.signatures)).toStrictEqual([[1, 2]]);
    expect(
      Array.flatMap(own.parameters, ({ name, descriptions }) =>
        Array.map(descriptions, ({ applies }) => [name, applies.overloads]),
      ),
    ).toStrictEqual([["input", [1]]]);
    expect(Reference.page(reference(), "pkg/index.html").markdown).toContain(
      "readonly flag: true;",
    );
  });

  test("independent_and_missing_parts", () => {
    expect.hasAssertions();
    expect(summaries(ownOf("Pair"))).toStrictEqual([
      [Option.some("Type side."), [1]],
      [Option.some("Value side."), [2]],
    ]);
    const partial = ownOf("partial");
    expect(summaries(partial)).toStrictEqual([
      [Option.some("Documented."), [1, 2]],
    ]);
    expect(
      pipe(
        Option.toArray(partial.signatures),
        Array.flatMap(({ children }) => children),
        Array.map(({ facts }) => Option.isSome(facts)),
      ),
    ).toStrictEqual([true, false]);
  });

  test("member_and_namespace_content", () => {
    expect.hasAssertions();
    const own = ownOf("Model");
    expect(
      Array.map(own.members, (member) => [member.name, member.static]),
    ).toStrictEqual([
      ["make", true],
      ["make", false],
      ["value", false],
    ]);
    expect(
      summaries(Array.get(own.members, 2).pipe(Option.getOrThrow)),
    ).toStrictEqual([
      [Option.some("Getter."), [1]],
      [Option.some("Setter."), [2]],
    ]);
    expect(
      own.namespace.pipe(
        Option.flatMap(({ comment }) => comment),
        Option.flatMap(summaryOf),
      ),
    ).toStrictEqual(Option.some("Namespace with Value."));
    expect(Option.flatMap(Entry.summary(own), summaryOf)).toStrictEqual(
      Option.some("Model."),
    );
  });

  test("linked_signatures", () => {
    expect.hasAssertions();
    const { ast } = reference().document.catalogue;
    const value = Reference.id(reference(), ["Value"]);
    const names = pipe(
      Option.toArray(ownOf("choose").signatures),
      Array.flatMap(({ children }) => children),
      Array.flatMap(({ syntax }) =>
        Array.flatMap(syntax, TypeScript.Node.identifiers),
      ),
      Array.filter(({ text }) => text === "Value"),
    );
    expect(names).toHaveLength(4);
    expect(
      Array.map(names, (name) =>
        Option.map(ast.referenceAt(name), ({ target }) => target),
      ),
    ).toStrictEqual(
      Array.makeBy(4, () => Option.some({ _tag: "Local", node: value })),
    );
  });
});
