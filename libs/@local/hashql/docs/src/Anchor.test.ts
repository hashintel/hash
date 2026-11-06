import { Array, HashMap, Option, Result } from "effect";
import { describe, expect, test } from "vitest";

import * as Anchor from "./Anchor.js";

const fileOf = (paths: readonly Anchor.Path[], path: Anchor.Path): string => {
  const files = Result.getOrThrow(Anchor.files(paths));
  return HashMap.get(files, path).pipe(Option.getOrThrow);
};

/** An element's anchor on a page. */
const element = (file: string, id: string): Anchor.Anchor => ({
  file: Anchor.File(file),
  id: Option.some(Anchor.AnchorId(id)),
});

/** A page's own anchor, which has no element id. */
const page = (file: string): Anchor.Anchor => ({
  file: Anchor.File(file),
  id: Option.none(),
});

describe("anchor", () => {
  test("reserved_ids", () => {
    expect.hasAssertions();
    const ids = Anchor.ids([
      element("one.html", "entry"),
      element("one.html", "entry-2"),
      page("two.html"),
    ]);
    const one = Anchor.File("one.html");
    const entry = Anchor.AnchorId("entry");
    expect([
      ids.reserve(one, entry),
      ids.reserve(one, entry),
      ids.reserve(Anchor.File("two.html"), entry),
    ]).toStrictEqual(["entry-3", "entry-4", "entry"]);
  });

  test("directory_indexes", () => {
    expect.hasAssertions();
    const paths = [
      [],
      ["pkg"],
      ["pkg", "Nested"],
      ["pkg", "Nested", "Leaf"],
      ["traits"],
    ];
    expect(Array.map(paths, (path) => fileOf(paths, path))).toStrictEqual([
      "index.html",
      "pkg/index.html",
      "pkg/Nested/index.html",
      "pkg/Nested/Leaf.html",
      "traits.html",
    ]);
  });

  test("filename_components", () => {
    expect.hasAssertions();
    expect(fileOf([["pkg", "a/b#?"]], ["pkg", "a/b#?"])).toBe(
      "pkg/a%2Fb%23%3F.html",
    );
    expect(fileOf([[".."]], [".."])).toBe("%2E%2E.html");
    expect(fileOf([["."]], ["."])).toBe("%2E.html");
    expect(fileOf([[""]], [""])).toBe("%00.html");
  });

  test("duplicate_path", () => {
    expect.hasAssertions();
    const result = Anchor.files([["pkg"], ["pkg"]]);
    expect(Result.isFailure(result)).toBe(true);
    expect(
      Result.getFailure(result).pipe(Option.getOrThrow).reason,
    ).toStrictEqual({
      _tag: "DuplicatePath",
      path: ["pkg"],
    });
  });

  test.each([
    [["pkg"], ["pkg", "index"]],
    [
      ["pkg", "Foo"],
      ["pkg", "foo"],
    ],
    [
      ["pkg", "Foo"],
      ["pkg", "foo"],
      ["pkg", "Foo", "A"],
      ["pkg", "foo", "B"],
    ],
  ])("file_collision %j", (...paths) => {
    expect.hasAssertions();
    const result = Anchor.files(paths);
    expect(Result.isFailure(result)).toBe(true);
  });

  test("relative_files", () => {
    expect.hasAssertions();
    expect(Anchor.relative("pkg/Nested/index.html", "pkg/Other.html")).toBe(
      "../Other.html",
    );
    expect(Anchor.relative("pkg/index.html", "pkg/Nested/index.html")).toBe(
      "./Nested/index.html",
    );
    expect(Anchor.relative("index.html", "pkg/One.html")).toBe(
      "./pkg/One.html",
    );
    expect(Anchor.relative("pkg/One.html", "index.html")).toBe("../index.html");
    expect(Anchor.relative("pkg/One.html", "pkg/Other.html")).toBe(
      "./Other.html",
    );
  });

  test("fragment_encoding", () => {
    expect.hasAssertions();
    const anchor = element("pkg/A%2FB.html", 'Model.["a#b"]');
    expect(Anchor.href(anchor, "pkg/A%2FB.html")).toBe(
      "#Model.%5B%22a%23b%22%5D",
    );
    expect(Anchor.href(anchor, "index.html")).toBe(
      "./pkg/A%252FB.html#Model.%5B%22a%23b%22%5D",
    );
    expect(Anchor.href(page("pkg/A.html"), "pkg/A.html")).toBe("./A.html");
  });

  test("pipeable_links", () => {
    expect.hasAssertions();
    expect(Anchor.relative("pkg/A.html")("index.html")).toBe("./pkg/A.html");
    expect(Anchor.href("index.html")(element("pkg/A.html", "value"))).toBe(
      "./pkg/A.html#value",
    );
  });
});
