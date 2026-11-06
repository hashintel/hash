import * as NodeServices from "@effect/platform-node/NodeServices";
import { Array, Effect, FileSystem, Option, Path, pipe } from "effect";
import { describe, expect, test } from "vitest";

import * as Source from "../src/Source.js";

const configuration = JSON.stringify({
  $schema:
    "https://developer.microsoft.com/json-schemas/tsdoc/v0/tsdoc.schema.json",
  tagDefinitions: [{ tagName: "@module", syntaxKind: "modifier" }],
});

const source = `/** Module with \`rich\` text and {@link Value}. @module */
/** Value description. */ export interface Value {
  /** Member description. */ readonly field: string;
}
/** First call.
 * @example
 * \`\`\`ts
 * import { choose } from "fixture";
 * choose({ field: "example" });
 * \`\`\`
 */
export function choose(value: Value): Value;
/** Second call. */ export function choose(value: number): number;
export { choose as again };
`;

const sourceMap = JSON.stringify({
  version: 3,
  sources: ["src/value.ts"],
  names: [],
  mappings: Array.map(source.split("\n"), (_, index) =>
    index === 0 ? "AAKA" : "AAAA",
  ).join(";"),
});

const inDirectory = async <A>(
  use: (directory: string) => Promise<A>,
): Promise<A> =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const directory = yield* fs.makeTempDirectoryScoped();
    yield* fs.writeFileString(
      path.join(directory, "exports.json"),
      '[["fixture", "index.d.ts"]]',
    );
    yield* fs.writeFileString(
      path.join(directory, "tsdoc.json"),
      configuration,
    );
    yield* fs.writeFileString(path.join(directory, "index.d.ts"), source);
    yield* fs.makeDirectory(path.join(directory, ".git"));
    yield* fs.writeFileString(
      path.join(directory, "index.d.ts.map"),
      sourceMap,
    );
    return yield* Effect.promise(async () => use(directory));
  }).pipe(
    Effect.scoped,
    // oxlint-disable-next-line effecttsgo/strict-effect-provide -- This fixture owns its temporary directory.
    Effect.provide(NodeServices.layer),
    Effect.runPromise,
  );

const modulePage = (loaded: Source.HastPages): Source.HastPage =>
  pipe(
    loaded.pages,
    Array.findFirst((page) => page.file === "fixture.html"),
    Option.getOrThrow,
  );

describe("source", () => {
  test("generated_formats", async () => {
    expect.hasAssertions();
    await inDirectory(async (directory) => {
      const load = Source.loader({
        directory,
        sourceUrl: ({ file, line }) => `https://source.test/${file}#L${line}`,
      });
      const loaded = await load();
      expect(loaded.pages.map(({ file }) => file)).toStrictEqual([
        "index.html",
        "traits.html",
        "fixture.html",
      ]);
      expect(loaded.folders).toStrictEqual([
        { directory: "", pages: ["index", "fixture", "traits"] },
      ]);
      const page = modulePage(loaded);
      expect(page.description).toBe("Module with rich text and Value.");
      expect(
        [
          "Module with `rich` text and [`Value`](#Value).",
          "First call.",
          "Second call.",
          'choose({ field: "example" });',
          "https://source.test/src/value.ts#L6",
        ].filter((text) => !page.markdown.includes(text)),
      ).toStrictEqual([]);
      const body = JSON.stringify(page.hast);
      expect(
        [
          '"tagName":"api-export"',
          '"tagName":"api-code"',
          '"href":"#Value"',
          '"names":["again"]',
        ].filter((text) => !body.includes(text)),
      ).toStrictEqual([]);
    });
  });

  test("search_and_outline", async () => {
    expect.hasAssertions();
    await inDirectory(async (directory) => {
      const page = modulePage(
        await Source.loader({ directory, sourceUrl: () => "" })(),
      );
      expect(page.toc).toContainEqual({
        title: "Value",
        url: "#Value",
        depth: 3,
        kind: "interface",
      });
      expect(page.structuredData.headings).toContainEqual({
        id: "Value",
        content: "Value",
      });
      expect(page.structuredData.contents).toContainEqual({
        heading: "Value",
        content: "Value description.",
      });
      expect(page.structuredData.contents).toContainEqual({
        heading: "Value",
        content: "Member description.",
      });
      expect(page.structuredData.contents).toContainEqual({
        heading: "choose",
        content:
          'import { choose } from "fixture";\nchoose({ field: "example" });',
      });
    });
  });

  test("lazy_load_failure", async () => {
    expect.hasAssertions();
    const load = Source.loader({
      directory: "/missing/hashql-docs-fixture",
      sourceUrl: () => "",
    });
    expect(load).toBeTypeOf("function");
    await expect(load()).rejects.toThrow("NotFound");
  });

  test("composition_failure", async () => {
    expect.hasAssertions();
    await inDirectory(async (directory) => {
      await Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        yield* fs.writeFileString(
          `${directory}/exports.json`,
          '[["@first/pkg", "index.d.ts"], ["@second/pkg", "index.d.ts"]]',
        );
      }).pipe(
        // oxlint-disable-next-line effecttsgo/strict-effect-provide -- This is the fixture's filesystem boundary.
        Effect.provide(NodeServices.layer),
        Effect.runPromise,
      );
      await expect(
        Source.loader({ directory, sourceUrl: () => "" })(),
      ).rejects.toMatchObject({ _tag: "AnchorError" });
    });
  });
});
