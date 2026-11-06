// oxlint-disable typescript/promise-function-async -- These loader fixtures return settled Promises without asynchronous work.
import { describe, expect, test } from "vitest";

import * as Source from "./Source.js";

const page: Source.HastPage = {
  file: "pkg/index.html",
  title: "Package",
  description: "Summary",
  toc: [{ title: "Value", url: "#Value", depth: 3, kind: "interface" }],
  structuredData: { headings: [], contents: [] },
  hast: { type: "root", children: [] },
  markdown: "# Package\n",
};

const load = (): Promise<Source.HastPages> =>
  Promise.resolve({
    pages: [page],
    folders: [
      { directory: "", pages: ["index", "pkg", "traits"] },
      { directory: "pkg", pages: ["index", "Child"] },
    ],
  });

describe("source", () => {
  test("mounted_files", async () => {
    expect.hasAssertions();
    const original = {
      type: "page" as const,
      path: "guide.mdx",
      data: { title: "Guide" },
    };
    const source = { files: [original] };
    const result = await Source.withHast(source, [{ dir: "reference", load }]);
    expect(source.files).toStrictEqual([original]);
    expect(result.files).toStrictEqual([
      original,
      {
        type: "page",
        path: "reference/pkg/index.html",
        data: {
          title: page.title,
          description: page.description,
          toc: page.toc,
          structuredData: page.structuredData,
          hast: page.hast,
          markdown: page.markdown,
        },
      },
      {
        type: "meta",
        path: "reference/meta.json",
        data: { pages: ["index", "pkg", "traits"] },
      },
      {
        type: "meta",
        path: "reference/pkg/meta.json",
        data: { pages: ["index", "Child"] },
      },
    ]);
    await expect(
      Source.withHast([{ dir: "reference", load }])(source),
    ).resolves.toStrictEqual(result);
  });

  test("root_mount", async () => {
    expect.hasAssertions();
    const result = await Source.withHast({ files: [] }, [{ dir: "", load }]);
    expect(result.files.map(({ path }) => path)).toStrictEqual([
      "pkg/index.html",
      "meta.json",
      "pkg/meta.json",
    ]);
  });

  test("mount_order", async () => {
    expect.hasAssertions();
    const result = await Source.withHast({ files: [] }, [
      { dir: "first", load },
      { dir: "second", load },
    ]);
    expect(result.files.map(({ path }) => path)).toStrictEqual([
      "first/pkg/index.html",
      "first/meta.json",
      "first/pkg/meta.json",
      "second/pkg/index.html",
      "second/meta.json",
      "second/pkg/meta.json",
    ]);
  });

  test("load_failure", async () => {
    expect.hasAssertions();
    const source = { files: [] };
    await expect(
      Source.withHast(source, [
        {
          dir: "broken",
          load: (): Promise<Source.HastPages> =>
            Promise.reject(new Error("load failed")),
        },
      ]),
    ).rejects.toThrow("load failed");
    expect(source.files).toStrictEqual([]);
  });
});
