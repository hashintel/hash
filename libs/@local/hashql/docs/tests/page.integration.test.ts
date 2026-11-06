import { Array, Effect, Option, Result, pipe } from "effect";
import { beforeAll, describe, expect, test } from "vitest";

import * as Page from "../src/Page.js";
import * as Reference from "./fixtures/reference.js";

import type { Element, Nodes, Properties } from "hast";

const source = `${Reference.source}
/** Trait lead.
 * @trait
 * @remarks Extra trait detail.
 * @example
 * \`\`\`ts
 * const x = 1;
 * \`\`\`
 */
interface Trait { readonly trait: true; }
/** Implements the trait. */ export interface Derived extends Trait { readonly own: true; }
/** Generic docs.
 * @typeParam T - A generic input.
 * @param value - Input docs.
 * @returns Return docs.
 * @throws {@link Value} When unavailable.
 * @remarks Details of the call.
 * @see {@link choose}
 * @example <caption>Caption with {@link Value}.</caption>
 * \`\`\`ts
 * import { identity } from "@scope/pkg";
 * identity(1);
 * \`\`\`
 */
export function identity<T>(value: T): T;
/** Namespace with \`rich\` content. */
export namespace Empty { export { choose as Alias }; }
`;

let loaded: Reference.Reference | null = null;
const reference = (): Reference.Reference =>
  Option.fromNullishOr(loaded).pipe(Option.getOrThrow);

/** Every element below `node`, depth first. */
const elementsOf = (node: Nodes): readonly Element[] => {
  let below: readonly Element[] = [];
  if ("children" in node) {
    below = Array.flatMap(node.children, elementsOf);
  }

  if (node.type === "element") {
    return Array.prepend(below, node);
  }

  return below;
};

const hastOf = (file: string): readonly Element[] =>
  pipe(
    Page.toHast(Reference.page(reference(), file)),
    Result.getOrThrow,
    elementsOf,
  );

/** An element's property by name, as the host reads it. */
const propertyOf = (element: Element, name: string): Properties[string] =>
  element.properties[name];

/** The text below an element. */
const textOf = (node: Nodes): string => {
  if (node.type === "text") {
    return node.value;
  }

  if ("children" in node) {
    return Array.map(node.children, textOf).join("");
  }

  return "";
};

/** The names of every row of `file` that the HAST marks deprecated. */
const deprecatedRows = (file: string): readonly Properties[string][] =>
  pipe(
    hastOf(file),
    Array.filter(
      ({ tagName, properties }) =>
        tagName === "api-row" && properties["deprecated"] === true,
    ),
    Array.map(({ properties }) => properties["names"]),
  );

/** The element children of `element`. */
const elementChildren = (element: Element): readonly Element[] =>
  Array.filter(
    element.children,
    (child): child is Element => child.type === "element",
  );

/** The name and the slot of each `api-hierarchy` element directly inside a `parent` element of `file`. */
const hierarchiesIn = (
  file: string,
  parent: string,
): readonly (readonly Properties[string][])[] =>
  pipe(
    hastOf(file),
    Array.filter(({ tagName }) => tagName === parent),
    Array.flatMap(elementChildren),
    Array.filter(({ tagName }) => tagName === "api-hierarchy"),
    Array.map((element) => [
      propertyOf(element, "name"),
      propertyOf(element, "slot"),
    ]),
  );

/** The `api-export` element of the export `name` on the module page. */
const exportOf = (name: string): Element =>
  pipe(
    hastOf("pkg/index.html"),
    Array.findFirst(
      (element) =>
        element.tagName === "api-export" &&
        propertyOf(element, "name") === name,
    ),
    Option.getOrThrow,
  );

/** The overloads each declaration of the export `name` names. */
const signatureOverloads = (name: string): readonly Properties[string][] =>
  pipe(
    exportOf(name),
    elementsOf,
    Array.filter(({ tagName }) => tagName === "api-signature"),
    Array.map((element) => propertyOf(element, "overloads")),
  );

/** The parts of the export `name` in the order the page writes them, a comment's by its sections. */
const partsOf = (name: string): readonly string[] =>
  Array.flatMap(elementChildren(exportOf(name)), (element) => {
    if (element.tagName !== "api-comment") {
      return [element.tagName];
    }

    return Array.map(elementChildren(element), ({ tagName }) => tagName);
  });

/** The text and the kind of each link on `page` to Effect's documentation. */
const effectLinks = (
  page: Reference.Written,
): readonly (readonly [string, Properties[string]])[] =>
  pipe(
    Page.toHast(page),
    Result.getOrThrow,
    elementsOf,
    Array.filter(
      (element) =>
        element.tagName === "a" &&
        String(propertyOf(element, "href")).startsWith(
          "https://effect.website/",
        ),
    ),
    Array.map((element) => [textOf(element), propertyOf(element, "dataKind")]),
  );

describe("page", () => {
  beforeAll(async () => {
    loaded = await Reference.success({
      source,
      other: 'export { choose as alias } from "./index.js";',
      configuration: "render-tsdoc.json",
    });
  });

  test("markdown", async () => {
    expect.hasAssertions();
    await Promise.all(
      Array.map(reference().pages, async ({ file, markdown }) =>
        expect(markdown).toMatchFileSnapshot(
          // A page's directories join its name, since the repository ignores every directory called `pkg`, and the extension keeps the Markdown formatter away from the bytes the writer produced.
          `fixtures/rendered/${file.replaceAll("/", "__")}.txt`,
        ),
      ),
    );
  });

  test("module_description", () => {
    expect.hasAssertions();
    expect(
      Page.description(Reference.page(reference(), "pkg/index.html")),
    ).toBe("Module with code and Value.");
  });

  test("hast_elements", () => {
    expect.hasAssertions();
    const names = Array.dedupe(
      Array.map(hastOf("pkg/index.html"), ({ tagName }) => tagName),
    );
    expect(names).toStrictEqual(
      expect.arrayContaining([
        "api-export",
        "api-signatures",
        "api-signature",
        "api-index",
        "api-row",
        "api-members",
        "api-parameters",
        "api-returns",
        "api-throws",
        "api-example",
        "api-related",
        "api-namespace",
      ]),
    );
  });

  test("hast_deprecation", () => {
    expect.hasAssertions();
    expect(deprecatedRows("pkg/index.html")).toStrictEqual(['["old"]']);
  });

  test("print_failure", async () => {
    expect.hasAssertions();
    await expect(
      Reference.run({
        source: "export declare const value: string;",
        print: () => Effect.succeed("export const = ;"),
      }),
    ).resolves.toMatchObject({
      _tag: "Failure",
      failure: { _tag: "PrintError", reason: { _tag: "InvalidSyntax" } },
    });
  });

  test("hierarchy_element", () => {
    expect.hasAssertions();
    const hierarchy = Array.findFirst(
      hastOf("pkg/index.html"),
      ({ tagName }) => tagName === "api-hierarchy",
    ).pipe(Option.getOrThrow);
    expect([
      propertyOf(hierarchy, "name"),
      Array.dedupe(
        Array.map(elementsOf(hierarchy).slice(1), ({ tagName }) => tagName),
      ),
    ]).toStrictEqual(["Derived", ["api-hierarchy-node", "api-hierarchy-edge"]]);
  });

  test("page_lead", () => {
    expect.hasAssertions();
    expect(
      Array.map(["index.html", "traits.html"], (file) => {
        const [first] = hastOf(file);

        return [
          first?.tagName,
          Option.getOrUndefined(
            Option.map(Option.fromUndefinedOr(first), textOf),
          ),
        ];
      }),
    ).toStrictEqual([
      ["api-description", "Package entrypoints and the traits of their types."],
      [
        "api-description",
        "Shared interfaces and the types that implement them.",
      ],
    ]);
  });

  test("hierarchy_slot", () => {
    expect.hasAssertions();
    expect([
      hierarchiesIn("pkg/index.html", "api-signatures"),
      hierarchiesIn("traits.html", "api-trait"),
    ]).toStrictEqual([[["Derived", "title"]], [["Trait", "header"]]]);
  });

  test("signature_overloads", () => {
    expect.hasAssertions();
    expect([
      signatureOverloads("choose"),
      signatureOverloads("identity"),
    ]).toStrictEqual([[[1], [2]], [undefined]]);
  });

  test("export_order", () => {
    expect.hasAssertions();
    expect(partsOf("identity")).toStrictEqual([
      "api-description",
      "api-signatures",
      "api-type-parameters",
      "api-parameters",
      "api-returns",
      "api-throws",
      "api-remarks",
      "api-example",
      "api-see",
    ]);
  });

  describe("names", () => {
    let names: Reference.Reference | null = null;
    const page = (): Reference.Written =>
      Reference.page(
        Option.fromNullishOr(names).pipe(Option.getOrThrow),
        "pkg.html",
      );

    beforeAll(async () => {
      names = await Reference.success({
        source: `declare const value: number;
declare const tick: number;
declare const spaced: number;
export { value as 'a"<&>', tick as "a\`b", spaced as "odd name" };
export interface Box { 'b"<&>': string }
/**
 * Run.
 * @param input - The input.
 *
 * \`\`\`ts
 * run("x1");
 * \`\`\`
 */
export declare function run(input: \`x\${string}\`): void;`,
      });
    });

    test("escaped_anchors", () => {
      expect.hasAssertions();
      const { markdown } = page();
      expect([
        markdown.includes('<a id="a&quot;&lt;&amp;&gt;"></a>'),
        markdown.includes('<a id="Box.b&quot;&lt;&amp;&gt;"></a>'),
      ]).toStrictEqual([true, true]);
    });

    test("code_with_backticks", () => {
      expect.hasAssertions();
      const { markdown } = page();
      expect([
        markdown.includes("[``a`b``](#a%60b)"),
        /`` input: `x\$\{string\}` ``/u.test(markdown),
      ]).toStrictEqual([true, true]);
    });

    test("spaced_names", () => {
      expect.hasAssertions();
      // A host's hast-to-jsx joins an array property with spaces, so the page writes a list of names as JSON.
      expect(
        pipe(
          Page.toHast(page()),
          Result.getOrThrow,
          elementsOf,
          Array.filter(({ properties }) =>
            String(properties["names"]).includes("odd"),
          ),
          Array.map(({ tagName, properties }) => [
            tagName,
            properties["names"],
          ]),
        ),
      ).toStrictEqual([
        ["api-row", '["odd name"]'],
        ["api-export", '["odd name"]'],
      ]);
    });

    test("prose_fence", () => {
      expect.hasAssertions();
      const fence = pipe(
        Page.toHast(page()),
        Result.getOrThrow,
        elementsOf,
        Array.filter(({ tagName }) => tagName === "api-code"),
        Array.findFirst((element) => textOf(element).includes('run("x1")')),
        Option.getOrThrow,
      );
      expect([propertyOf(fence, "lang"), textOf(fence)]).toStrictEqual([
        "ts",
        'run("x1");\n',
      ]);
    });
  });

  describe("external", () => {
    let external: Reference.Reference | null = null;

    beforeAll(async () => {
      external = await Reference.success({
        source: `import type { Equal } from "effect/Equal";
/** A model. */ export interface Model extends Equal {}`,
      });
    });

    test("external_link_kind", () => {
      expect.hasAssertions();
      expect(
        effectLinks(
          Reference.page(
            Option.fromNullishOr(external).pipe(Option.getOrThrow),
            "pkg.html",
          ),
        ),
      ).toStrictEqual([["Equal", "interface"]]);
    });

    test("trait_sentence", () => {
      expect.hasAssertions();
      const traits = Reference.page(
        Option.fromNullishOr(external).pipe(Option.getOrThrow),
        "traits.html",
      );
      expect([
        Array.filter(traits.markdown.split("\n"), (line) =>
          line.startsWith("Declared"),
        ),
        effectLinks(traits),
      ]).toStrictEqual([
        [
          "Declared as [`Equal.Equal`](https://effect.website/docs/v4/api/effect/Equal#Equal). Effect explains it in [its guide](https://effect.website/docs/trait/equal/).",
          "Declared as [`Hash.Hash`](https://effect.website/docs/v4/api/effect/Hash#Hash). Effect explains it in [its guide](https://effect.website/docs/trait/hash/).",
        ],
        [
          ["Equal.Equal", "interface"],
          ["its guide", undefined],
          ["Hash.Hash", "interface"],
          ["its guide", undefined],
        ],
      ]);
    });
  });
});
