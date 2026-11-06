import { Option, Result } from "effect";
import * as factory from "typescript/ast/factory";
import { describe, expect, test } from "vitest";

import * as AST from "./AST/index.js";
import * as Code from "./Code.js";

/** A name in code that refers to `node`, with no compiler behind either. */
const referenceTo = (node: AST.Declaration.Interned): AST.Reference.Reference =>
  AST.Reference.make({
    node: factory.createIdentifier("Box"),
    target: { _tag: "Local", node },
    url: Option.none(),
    quickInfo: Option.none(),
  });

/** A name that refers to the first declaration of a fresh AST, as every call's does. */
const target = (): AST.Reference.Reference =>
  referenceTo(AST.make().reserve<AST.Declaration.Declaration>().id);

/** A name that refers to the second declaration of a fresh AST, which `target`'s is not. */
const other = (): AST.Reference.Reference => {
  const ast = AST.make();
  ast.reserve<AST.Declaration.Declaration>();

  return referenceTo(ast.reserve<AST.Declaration.Declaration>().id);
};

describe("code", () => {
  test("link_hover_join", () => {
    expect.hasAssertions();
    const destination = target();
    const source = Code.prepare({
      text: "😀 Box + other \n",
      links: [{ offset: 3, length: 3, reference: destination }],
      quickInfo: [
        { offset: 9, length: 5, text: "const other: number" },
        { offset: 3, length: 3, text: "interface Box" },
      ],
    }).pipe(Result.getOrThrow);
    expect(source).toStrictEqual({
      text: "😀 Box + other \n",
      names: [
        {
          _tag: "Link",
          offset: 3,
          length: 3,
          reference: destination,
          quickInfo: Option.some("interface Box"),
        },
        {
          _tag: "Hover",
          offset: 9,
          length: 5,
          quickInfo: "const other: number",
        },
      ],
    });
  });

  test("annotation_order", () => {
    expect.hasAssertions();
    const destination = target();
    expect(
      Code.prepare({
        text: "Box + Box",
        links: [
          { offset: 6, length: 3, reference: destination },
          { offset: 0, length: 3, reference: destination },
        ],
        quickInfo: [],
      }),
    ).toStrictEqual(
      Result.succeed({
        text: "Box + Box",
        names: [
          {
            _tag: "Link",
            offset: 0,
            length: 3,
            reference: destination,
            quickInfo: Option.none(),
          },
          {
            _tag: "Link",
            offset: 6,
            length: 3,
            reference: destination,
            quickInfo: Option.none(),
          },
        ],
      }),
    );
  });

  test("duplicate_annotations", () => {
    expect.hasAssertions();
    const source = Code.prepare({
      text: "Box",
      links: [
        { offset: 0, length: 3, reference: target() },
        { offset: 0, length: 3, reference: target() },
      ],
      quickInfo: [
        { offset: 0, length: 3, text: "Box" },
        { offset: 0, length: 3, text: "Box" },
      ],
    }).pipe(Result.getOrThrow);
    expect(source.names).toHaveLength(1);
    expect(source.names[0]).toMatchObject({
      _tag: "Link",
      quickInfo: Option.some("Box"),
    });
  });

  test("plain_source", () => {
    expect.hasAssertions();
    expect(
      Code.prepare({ text: "  <script>\n", links: [], quickInfo: [] }),
    ).toStrictEqual(Result.succeed({ text: "  <script>\n", names: [] }));
  });

  test.each([
    { offset: -1, length: 1 },
    { offset: 0.5, length: 1 },
    { offset: 0, length: 0 },
    { offset: 0, length: -1 },
    { offset: 0, length: 4 },
    { offset: 3, length: 1 },
    { offset: 0, length: 1.5 },
    { offset: Number.NaN, length: 1 },
    { offset: 0, length: Number.POSITIVE_INFINITY },
  ])("invalid_range $offset $length", ({ offset, length }) => {
    expect.hasAssertions();
    expect(
      Code.prepare({
        text: "Box",
        links: [{ offset, length, reference: target() }],
        quickInfo: [],
      }),
    ).toMatchObject({
      _tag: "Failure",
      failure: {
        _tag: "CodeError",
        reason: { _tag: "InvalidRange", offset, length, size: 3 },
      },
    });
  });

  test("overlapping_ranges", () => {
    expect.hasAssertions();
    expect(
      Code.prepare({
        text: "Box",
        links: [{ offset: 0, length: 3, reference: target() }],
        quickInfo: [{ offset: 1, length: 2, text: "overlap" }],
      }),
    ).toMatchObject({
      _tag: "Failure",
      failure: {
        reason: { _tag: "OverlappingRanges", offset: 1, previousEnd: 3 },
      },
    });
  });

  test("conflicting_targets", () => {
    expect.hasAssertions();
    expect(
      Code.prepare({
        text: "Box",
        links: [
          { offset: 0, length: 3, reference: target() },
          { offset: 0, length: 3, reference: other() },
        ],
        quickInfo: [],
      }),
    ).toMatchObject({
      _tag: "Failure",
      failure: { reason: { _tag: "ConflictingRange", offset: 0 } },
    });
  });

  test("conflicting_lengths", () => {
    expect.hasAssertions();
    expect(
      Code.prepare({
        text: "Box",
        links: [{ offset: 0, length: 3, reference: target() }],
        quickInfo: [{ offset: 0, length: 2, text: "shorter" }],
      }),
    ).toMatchObject({
      _tag: "Failure",
      failure: { reason: { _tag: "ConflictingRange", offset: 0 } },
    });
  });

  test("conflicting_link_lengths", () => {
    expect.hasAssertions();
    expect(
      Code.prepare({
        text: "Box",
        links: [
          { offset: 0, length: 3, reference: target() },
          { offset: 0, length: 2, reference: target() },
        ],
        quickInfo: [],
      }),
    ).toMatchObject({
      _tag: "Failure",
      failure: { reason: { _tag: "ConflictingRange", offset: 0 } },
    });
  });

  test("conflicting_hover", () => {
    expect.hasAssertions();
    expect(
      Code.prepare({
        text: "Box",
        links: [],
        quickInfo: [
          { offset: 0, length: 3, text: "first" },
          { offset: 0, length: 3, text: "second" },
        ],
      }),
    ).toMatchObject({
      _tag: "Failure",
      failure: { reason: { _tag: "ConflictingRange", offset: 0 } },
    });
  });
});
