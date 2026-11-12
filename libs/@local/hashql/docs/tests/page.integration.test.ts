import { expect, layer } from "@effect/vitest";
import { Array, Effect, Option, Result, pipe } from "effect";

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
/** Box. */ export class Box {
  /** Reads.
   * @returns The held value.
   * @throws \`RangeError\` When empty.
   */
  get held(): Value;
  /** Writes. @param next - The value to hold. */
  set held(next: Value | number);
  /** Ready. @throws \`Error\` When unset. */
  readonly ready: boolean;
}
`;

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

const hastOf = (
  reference: Reference.Reference,
  file: string,
): readonly Element[] =>
  pipe(
    Page.toHast(Reference.page(reference, file)),
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
const deprecatedRows = (
  reference: Reference.Reference,
  file: string,
): readonly Properties[string][] =>
  pipe(
    hastOf(reference, file),
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
  reference: Reference.Reference,
  file: string,
  parent: string,
): readonly (readonly Properties[string][])[] =>
  pipe(
    hastOf(reference, file),
    Array.filter(({ tagName }) => tagName === parent),
    Array.flatMap(elementChildren),
    Array.filter(({ tagName }) => tagName === "api-hierarchy"),
    Array.map((element) => [
      propertyOf(element, "name"),
      propertyOf(element, "slot"),
    ]),
  );

/** The `api-export` element of the export `name` on the module page. */
const exportOf = (reference: Reference.Reference, name: string): Element =>
  pipe(
    hastOf(reference, "pkg/index.html"),
    Array.findFirst(
      (element) =>
        element.tagName === "api-export" &&
        propertyOf(element, "name") === name,
    ),
    Option.getOrThrow,
  );

/** The overloads each declaration of the export `name` names. */
const signatureOverloads = (
  reference: Reference.Reference,
  name: string,
): readonly Properties[string][] =>
  pipe(
    exportOf(reference, name),
    elementsOf,
    Array.filter(({ tagName }) => tagName === "api-signature"),
    Array.map((element) => propertyOf(element, "overloads")),
  );

/** The parts of `element` in the order the page writes them, a comment's by its sections. */
const partsIn = (element: Element): readonly string[] =>
  Array.flatMap(elementChildren(element), (child) => {
    if (child.tagName !== "api-comment") {
      return [child.tagName];
    }

    return Array.map(elementChildren(child), ({ tagName }) => tagName);
  });

/** The parts of the export `name` in the order the page writes them. */
const partsOf = (
  reference: Reference.Reference,
  name: string,
): readonly string[] => partsIn(exportOf(reference, name));

/** The element of the member whose anchor is `name` on the module page. */
const memberOf = (reference: Reference.Reference, name: string): Element =>
  pipe(
    hastOf(reference, "pkg/index.html"),
    Array.findFirst((element) => propertyOf(element, "name") === name),
    Option.getOrThrow,
  );

/** The version, the stability and the internal mark an element states. */
const stated = (element: Element): readonly Properties[string][] => [
  propertyOf(element, "since"),
  propertyOf(element, "stability"),
  propertyOf(element, "internal"),
];

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

/** What a page's HAST states about one error. `descriptions` holds the overloads each of its descriptions names. */
interface Thrown {
  readonly error: readonly string[];
  readonly overloads: Properties[string];
  readonly every: Properties[string];
  readonly descriptions: readonly Properties[string][];
}

/** Each error of the export `name` on `page`. */
const throwsOf = (page: Reference.Written, name: string): readonly Thrown[] =>
  pipe(
    Page.toHast(page),
    Result.getOrThrow,
    elementsOf,
    Array.findFirst(
      (element) =>
        element.tagName === "api-export" &&
        propertyOf(element, "name") === name,
    ),
    Option.getOrThrow,
    elementsOf,
    Array.filter(({ tagName }) => tagName === "api-throw"),
    Array.map((thrown) => ({
      error: pipe(
        elementChildren(thrown),
        Array.filter(({ tagName }) => tagName === "api-error"),
        Array.map(textOf),
      ),
      overloads: propertyOf(thrown, "overloads"),
      every: propertyOf(thrown, "every"),
      descriptions: pipe(
        elementChildren(thrown),
        Array.filter(({ tagName }) => tagName === "api-described"),
        Array.map((described) => propertyOf(described, "overloads")),
      ),
    })),
  );

/** The paragraphs under each "Throws" label of a Markdown page, up to the next heading. */
const thrownSections = (markdown: string): readonly (readonly string[])[] =>
  pipe(
    markdown.split("**Throws**\n\n"),
    Array.drop(1),
    Array.map((rest) =>
      Array.filter(
        Array.takeWhile(rest.split("\n"), (line) => !line.startsWith("#")),
        (line) => line.length > 0,
      ),
    ),
  );

/** The one page of the reference the tests of one source share. */
const namesPage = (reference: Reference.Reference): Reference.Written =>
  Reference.page(reference, "pkg.html");

layer(
  Reference.layer({
    source,
    other: 'export { choose as alias } from "./index.js";',
    configuration: "render-tsdoc.json",
  }),
  { excludeTestServices: true },
)("page", (it) => {
  it.effect(
    "markdown",
    Effect.fnUntraced(function* () {
      expect.hasAssertions();
      const reference = yield* Reference.Fixture;
      yield* Effect.forEach(
        reference.pages,
        ({ file, markdown }) =>
          Effect.promise(() =>
            expect(markdown).toMatchFileSnapshot(
              // A page's directories join its name, since the repository ignores every directory called `pkg`, and the extension keeps the Markdown formatter away from the bytes the writer produced.
              `fixtures/rendered/${file.replaceAll("/", "__")}.txt`,
            ),
          ),
        { concurrency: "unbounded" },
      );
    }),
  );

  it.effect(
    "module_description",
    Effect.fnUntraced(function* () {
      expect.hasAssertions();
      const reference = yield* Reference.Fixture;
      expect(
        Page.description(Reference.page(reference, "pkg/index.html")),
      ).toBe("Module with code and Value.");
    }),
  );

  it.effect(
    "hast_elements",
    Effect.fnUntraced(function* () {
      expect.hasAssertions();
      const reference = yield* Reference.Fixture;
      const names = Array.dedupe(
        Array.map(
          hastOf(reference, "pkg/index.html"),
          ({ tagName }) => tagName,
        ),
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
    }),
  );

  it.effect(
    "hast_deprecation",
    Effect.fnUntraced(function* () {
      expect.hasAssertions();
      const reference = yield* Reference.Fixture;
      expect(deprecatedRows(reference, "pkg/index.html")).toStrictEqual([
        '["old"]',
      ]);
    }),
  );

  it.effect(
    "print_failure",
    Effect.fnUntraced(function* () {
      expect.hasAssertions();
      expect(
        yield* Reference.run({
          source: "export declare const value: string;",
          print: () => Effect.succeed("export const = ;"),
        }),
      ).toMatchObject({
        _tag: "Failure",
        failure: { _tag: "PrintError", reason: { _tag: "InvalidSyntax" } },
      });
    }),
  );

  it.effect(
    "wrapped_member",
    Effect.fnUntraced(function* () {
      expect.hasAssertions();
      const result = yield* Reference.success({
        source: `/** A box. */
export interface Box {
  readonly wrapped: (
    first: ReadonlyArray<ReadonlyArray<string>>,
    second: ReadonlyArray<ReadonlyArray<number>>,
  ) => ReadonlyArray<ReadonlyArray<boolean>>;
}`,
      });
      expect(Reference.page(result, "pkg.html").markdown).toContain(
        [
          "```ts",
          "readonly wrapped: (",
          "  first: ReadonlyArray<ReadonlyArray<string>>,",
          "  second: ReadonlyArray<ReadonlyArray<number>>,",
          ") => ReadonlyArray<ReadonlyArray<boolean>>;",
          "```",
        ].join("\n"),
      );
    }),
  );

  it.effect(
    "external_meanings",
    Effect.fnUntraced(function* () {
      expect.hasAssertions();
      const option = "https://effect.website/docs/v4/api/effect/Option";
      const result = yield* Reference.success({
        source: `import type * as Option from "effect/Option";
/**
 * A value.
 *
 * @example
 * \`\`\`ts
 * import * as Option from "effect/Option";
 * type Some = Option.Option.Value<Option.Option<number>>;
 * \`\`\`
 */
export declare const value: Option.Option.Value<Option.Option<string>>;`,
      });
      expect(
        pipe(
          Page.toHast(Reference.page(result, "pkg.html")),
          Result.getOrThrow,
          elementsOf,
          Array.filter(
            (element) =>
              element.tagName === "a" &&
              String(propertyOf(element, "href")).startsWith(
                "https://effect.website/",
              ),
          ),
          Array.map((element) => [
            textOf(element),
            propertyOf(element, "href"),
          ]),
        ),
      ).toStrictEqual([
        // The module, the namespace and its member, then the module and the type that shares the namespace's name.
        ["Option", option],
        ["Option", `${option}#Option-namespace`],
        ["Value", `${option}#Option-namespace`],
        ["Option", option],
        ["Option", `${option}#Option-type`],
        // The example's import names the module, and its type reads the same names the same way.
        ["Option", option],
        ["Option", option],
        ["Option", `${option}#Option-namespace`],
        ["Value", `${option}#Option-namespace`],
        ["Option", option],
        ["Option", `${option}#Option-type`],
      ]);
    }),
  );

  it.effect(
    "hierarchy_element",
    Effect.fnUntraced(function* () {
      expect.hasAssertions();
      const reference = yield* Reference.Fixture;
      const hierarchy = Array.findFirst(
        hastOf(reference, "pkg/index.html"),
        ({ tagName }) => tagName === "api-hierarchy",
      ).pipe(Option.getOrThrow);
      expect([
        propertyOf(hierarchy, "name"),
        Array.dedupe(
          Array.map(elementsOf(hierarchy).slice(1), ({ tagName }) => tagName),
        ),
      ]).toStrictEqual([
        "Derived",
        ["api-hierarchy-node", "api-hierarchy-edge"],
      ]);
    }),
  );

  it.effect(
    "page_lead",
    Effect.fnUntraced(function* () {
      expect.hasAssertions();
      const reference = yield* Reference.Fixture;
      expect(
        Array.map(["index.html", "traits.html"], (file) => {
          const [first] = hastOf(reference, file);

          return [
            first?.tagName,
            Option.getOrUndefined(
              Option.map(Option.fromUndefinedOr(first), textOf),
            ),
          ];
        }),
      ).toStrictEqual([
        [
          "api-description",
          "Package entrypoints and the traits of their types.",
        ],
        [
          "api-description",
          "Shared interfaces and the types that implement them.",
        ],
      ]);
    }),
  );

  it.effect(
    "hierarchy_slot",
    Effect.fnUntraced(function* () {
      expect.hasAssertions();
      const reference = yield* Reference.Fixture;
      expect([
        hierarchiesIn(reference, "pkg/index.html", "api-signatures"),
        hierarchiesIn(reference, "traits.html", "api-trait"),
      ]).toStrictEqual([[["Derived", "title"]], [["Trait", "header"]]]);
    }),
  );

  it.effect(
    "signature_overloads",
    Effect.fnUntraced(function* () {
      expect.hasAssertions();
      const reference = yield* Reference.Fixture;
      expect([
        signatureOverloads(reference, "choose"),
        signatureOverloads(reference, "identity"),
      ]).toStrictEqual([[[1], [2]], [undefined]]);
    }),
  );

  it.effect(
    "signature_counts",
    Effect.fnUntraced(function* () {
      expect.hasAssertions();
      const reference = yield* Reference.Fixture;
      const counted = (name: string): readonly Properties[string][] =>
        pipe(
          exportOf(reference, name),
          elementChildren,
          Array.filter(({ tagName }) => tagName === "api-signatures"),
          Array.flatMap((element) => [
            propertyOf(element, "overloads"),
            propertyOf(element, "counted"),
          ]),
        );
      expect([counted("choose"), counted("Pair")]).toStrictEqual([
        [2, "overloads"],
        [2, "declarations"],
      ]);
      const { markdown } = Reference.page(reference, "pkg/index.html");
      expect(markdown).toContain(
        "(2) Value side.\n\n**Signatures · 2 declarations**",
      );
    }),
  );

  it.effect(
    "members_last",
    Effect.fnUntraced(function* () {
      expect.hasAssertions();
      const reference = yield* Reference.Fixture;
      const { markdown } = Reference.page(reference, "pkg/index.html");
      const start = markdown.indexOf('### <a id="Value"></a>Value');
      const section = markdown.slice(
        start,
        markdown.indexOf("\n### ", start + 1),
      );
      expect(
        Array.filter(section.split("\n"), (line) =>
          /^(?:\*\*|<a id=)/u.test(line),
        ),
      ).toStrictEqual([
        "**Signature**",
        "**Accepted by**",
        "**Returned by**",
        "**Members**",
        '<a id="Value.text"></a>**`text`**',
      ]);
    }),
  );

  it.effect(
    "member_calls",
    Effect.fnUntraced(function* () {
      expect.hasAssertions();
      const reference = yield* Reference.Fixture;
      const held = memberOf(reference, "Box.held");
      expect(
        Array.map(elementChildren(held), (half) => [
          half.tagName,
          partsIn(half),
        ]),
      ).toStrictEqual([
        [
          "api-getter",
          ["api-signature", "api-description", "api-returns", "api-throws"],
        ],
        ["api-setter", ["api-signature", "api-description", "api-parameters"]],
      ]);
      expect(
        Array.filter(
          elementsOf(held),
          (element) => propertyOf(element, "overloads") !== undefined,
        ),
      ).toStrictEqual([]);
      expect(partsIn(memberOf(reference, "Box.ready"))).toStrictEqual([
        "api-signatures",
        "api-description",
        "api-throws",
      ]);
    }),
  );

  it.effect(
    "export_order",
    Effect.fnUntraced(function* () {
      expect.hasAssertions();
      const reference = yield* Reference.Fixture;
      expect(partsOf(reference, "identity")).toStrictEqual([
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
    }),
  );

  it.layer(
    Reference.layer({
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
    }),
  )("names", (it) => {
    it.effect(
      "escaped_anchors",
      Effect.fnUntraced(function* () {
        expect.hasAssertions();
        const reference = yield* Reference.Fixture;
        const { markdown } = namesPage(reference);
        expect([
          markdown.includes('<a id="a&quot;&lt;&amp;&gt;"></a>'),
          markdown.includes('<a id="Box.b&quot;&lt;&amp;&gt;"></a>'),
        ]).toStrictEqual([true, true]);
      }),
    );

    it.effect(
      "code_with_backticks",
      Effect.fnUntraced(function* () {
        expect.hasAssertions();
        const reference = yield* Reference.Fixture;
        const { markdown } = namesPage(reference);
        expect([
          markdown.includes("[``a`b``](#a%60b)"),
          /`` input: `x\$\{string\}` ``/u.test(markdown),
        ]).toStrictEqual([true, true]);
      }),
    );

    it.effect(
      "spaced_names",
      Effect.fnUntraced(function* () {
        expect.hasAssertions();
        const reference = yield* Reference.Fixture;
        // A host's hast-to-jsx joins an array property with spaces, so the page writes a list of names as JSON.
        expect(
          pipe(
            Page.toHast(namesPage(reference)),
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
      }),
    );

    it.effect(
      "prose_fence",
      Effect.fnUntraced(function* () {
        expect.hasAssertions();
        const reference = yield* Reference.Fixture;
        const fence = pipe(
          Page.toHast(namesPage(reference)),
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
      }),
    );
  });

  it.layer(
    Reference.layer({
      source: `/** First.
 * @throws \`RangeError\` When released.
 */
export function rewrap(value: string): void;
/** Second.
 * @throws \`RangeError\` When released.
 * @throws \`TypeError\` When not an error.
 * @throws Without a name.
 */
export function rewrap(value: number): void;
export function rewrap(): void;
/** Plain.
 * @throws \`RangeError\` When released.
 */
export function plain(value: string): void;
export function plain(): void;`,
    }),
  )("throws", (it) => {
    it.effect(
      "every_overload_flag",
      Effect.fnUntraced(function* () {
        expect.hasAssertions();
        const reference = yield* Reference.Fixture;
        const page = namesPage(reference);
        expect([
          throwsOf(page, "rewrap"),
          throwsOf(page, "plain"),
        ]).toStrictEqual([
          [
            {
              error: ["RangeError"],
              overloads: undefined,
              every: true,
              descriptions: [undefined],
            },
            {
              error: ["TypeError"],
              overloads: [2],
              every: undefined,
              descriptions: [undefined],
            },
            {
              error: [],
              overloads: [2],
              every: undefined,
              descriptions: [undefined],
            },
          ],
          [
            {
              error: ["RangeError"],
              overloads: undefined,
              every: undefined,
              descriptions: [undefined],
            },
          ],
        ]);
      }),
    );

    it.effect(
      "every_overload_note",
      Effect.fnUntraced(function* () {
        expect.hasAssertions();
        const reference = yield* Reference.Fixture;
        expect(thrownSections(namesPage(reference).markdown)).toStrictEqual([
          [
            "`RangeError` (all)",
            "When released.",
            "`TypeError` (2)",
            "When not an error.",
            "(2) Without a name.",
          ],
          ["`RangeError`", "When released."],
        ]);
      }),
    );
  });

  it.layer(
    Reference.layer({
      source: `/** First.
 * @since 0.1.0
 */
export function pick(value: string): string;
/** Second.
 * @since 0.2.0
 * @stability experimental
 */
export function pick(value: number): number;
/** Third.
 * @since 0.1.0
 */
export function pick(value: boolean): boolean;
export function pick(): void;
export declare class Box {
  /** Reads.
   * @since 0.1.0
   */
  get held(): string;
  /** Writes.
   * @since 0.3.0
   * @internal
   */
  set held(value: string);
}`,
    }),
  )("facts", (it) => {
    it.effect(
      "unstated_declaration_facts",
      Effect.fnUntraced(function* () {
        expect.hasAssertions();
        const reference = yield* Reference.Fixture;
        const entry = (name: string): Element =>
          pipe(
            hastOf(reference, "pkg.html"),
            Array.findFirst((element) => propertyOf(element, "name") === name),
            Option.getOrThrow,
          );
        const declarations = (
          name: string,
        ): readonly (readonly Properties[string][])[] =>
          pipe(
            elementsOf(entry(name)),
            Array.filter(({ tagName }) => tagName === "api-signature"),
            Array.map(stated),
          );
        expect(stated(entry("pick"))).toStrictEqual([
          "0.1.0",
          undefined,
          undefined,
        ]);
        expect(declarations("pick")).toStrictEqual([
          [undefined, undefined, undefined],
          ["0.2.0", "experimental", undefined],
          [undefined, undefined, undefined],
          [undefined, undefined, undefined],
        ]);
        expect(stated(entry("Box.held"))).toStrictEqual([
          "0.1.0",
          undefined,
          undefined,
        ]);
        expect(declarations("Box.held")).toStrictEqual([
          [undefined, undefined, undefined],
          ["0.3.0", undefined, true],
        ]);
      }),
    );
  });

  it.layer(
    Reference.layer({
      source: `import type { Equal } from "effect/Equal";
/** A model. */ export interface Model extends Equal {}`,
    }),
  )("external", (it) => {
    it.effect(
      "external_link_kind",
      Effect.fnUntraced(function* () {
        expect.hasAssertions();
        const reference = yield* Reference.Fixture;
        expect(
          effectLinks(Reference.page(reference, "pkg.html")),
        ).toStrictEqual([["Equal", "interface"]]);
      }),
    );

    it.effect(
      "trait_sentence",
      Effect.fnUntraced(function* () {
        expect.hasAssertions();
        const reference = yield* Reference.Fixture;
        const traits = Reference.page(reference, "traits.html");
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
      }),
    );
  });
});
