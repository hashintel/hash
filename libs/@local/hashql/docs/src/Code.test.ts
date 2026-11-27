import { describe, expect, test } from "@effect/vitest";
import { Option, Result } from "effect";

import * as Code from "./Code.js";

import type * as AST from "./AST/index.js";

/** A name that reads as a type and links to the node at `index`, with no AST behind it. */
const linkTo = (index: number): Pick<Code.Link, "target" | "meaning"> => ({
  // SAFETY: Preparing code compares a link's target by identity and never looks it up in an AST.
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- No preparation dereferences this identity.
  target: index as AST.Target.Interned,
  meaning: "type",
});

/** A name that links to the first declaration of an AST, as every call's does. */
const target = (): Pick<Code.Link, "target" | "meaning"> => linkTo(0);

/** A name that links to the second declaration of an AST, which `target`'s is not. */
const other = (): Pick<Code.Link, "target" | "meaning"> => linkTo(1);

describe("code", () => {
  test("link_hover_join", () => {
    expect.hasAssertions();
    const destination = target();
    const source = Code.prepare({
      text: "😀 Box + other \n",
      links: [{ offset: 3, length: 3, ...destination }],
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
          ...destination,
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
          { offset: 6, length: 3, ...destination },
          { offset: 0, length: 3, ...destination },
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
            ...destination,
            quickInfo: Option.none(),
          },
          {
            _tag: "Link",
            offset: 6,
            length: 3,
            ...destination,
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
        { offset: 0, length: 3, ...target() },
        { offset: 0, length: 3, ...target() },
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
        links: [{ offset, length, ...target() }],
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
        links: [{ offset: 0, length: 3, ...target() }],
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
          { offset: 0, length: 3, ...target() },
          { offset: 0, length: 3, ...other() },
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
        links: [{ offset: 0, length: 3, ...target() }],
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
          { offset: 0, length: 3, ...target() },
          { offset: 0, length: 2, ...target() },
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
