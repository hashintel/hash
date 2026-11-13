import { expect, layer } from "@effect/vitest";
import { Array, Effect, HashMap, Option, pipe } from "effect";
import {
  SyntaxKind,
  isClassDeclaration,
  isExportDeclaration,
  isNamedExports,
} from "typescript/ast";

import * as Entry from "../src/Entry.js";
import * as References from "../src/internal/references.js";
import * as Tree from "../src/Tree/index.js";
import * as TypeScript from "../src/TypeScript/index.js";
import * as Reference from "./fixtures/reference.js";

import type { Node } from "typescript/ast";

const ownOf = (reference: Reference.Reference, name: string): Tree.Export.Own =>
  HashMap.get(reference.document.entries, Reference.id(reference, [name])).pipe(
    Option.getOrThrow,
  );

/** The export of the value `name`, where its type is declared apart from it. */
const valueOf = (
  reference: Reference.Reference,
  name: string,
): Option.Option<Tree.Export.Own> =>
  HashMap.get(reference.document.values, Reference.id(reference, [name]));

/** The syntax every declaration of the export at `path` shows. */
const syntaxOf = (
  reference: Reference.Reference,
  path: readonly string[],
): readonly Node[] =>
  pipe(
    HashMap.get(reference.document.entries, Reference.id(reference, path)),
    Option.flatMap(({ signatures }) => signatures),
    Option.toArray,
    Array.flatMap(({ children }) => children),
    Array.flatMap(({ syntax }) => syntax),
  );

/** A class's name and modifiers, or the names an export statement exports, as `local public` pairs, each marked where it is type-only. */
const shapeOf = (node: Node): readonly (string | number)[] => {
  if (isClassDeclaration(node)) {
    return [
      "class",
      node.name?.text ?? "",
      ...Array.map(node.modifiers ?? [], ({ kind }) => kind),
    ];
  }
  if (
    isExportDeclaration(node) &&
    node.exportClause !== undefined &&
    isNamedExports(node.exportClause)
  ) {
    return [
      node.isTypeOnly ? "export type" : "export",
      ...Array.map(
        node.exportClause.elements,
        ({ isTypeOnly, propertyName, name }) =>
          `${isTypeOnly ? "type " : ""}${propertyName?.text ?? name.text} ${name.text}`,
      ),
    ];
  }

  return [node.kind];
};

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

/** The meaning and the kind of an export, with the overloads each of its declarations numbers, its members' names and whether it holds a namespace. */
const documentedOf = (
  own: Tree.Export.Own,
): readonly [
  Option.Option<Tree.Export.Meaning>,
  Tree.Export.Kind,
  readonly (readonly number[])[],
  readonly string[],
  boolean,
] => [
  own.meaning,
  own.kind,
  numbersOf(own.signatures),
  Array.map(own.members, ({ name }) => name),
  Option.isSome(own.namespace),
];

type Applied = readonly [text: string, overloads: readonly number[]];

const describedOf = <Origin>(
  values: readonly Tree.Callable.Described<Origin>[],
): readonly Applied[] =>
  Array.map(values, ({ children, applies }) => [
    Option.getOrThrow(Tree.Prose.plain(children)),
    applies.overloads,
  ]);

const formsOf = <Origin>(
  values: readonly Tree.Callable.Form<Origin>[],
): readonly Applied[] =>
  Array.map(values, ({ type, applies }) => [type.getText(), applies.overloads]);

interface Calls {
  readonly parameters: readonly {
    readonly name: string;
    readonly forms: readonly Applied[];
    readonly descriptions: readonly Applied[];
  }[];
  readonly returns: Option.Option<{
    readonly forms: readonly Applied[];
    readonly descriptions: readonly Applied[];
  }>;
  readonly throws: readonly {
    readonly error: Option.Option<string>;
    readonly overloads: readonly number[];
    readonly descriptions: readonly Applied[];
  }[];
}

/** What comments document about calls: every type, description and error with the overloads it holds in. */
const callsOf = ({
  parameters,
  returns,
  throws,
}: Tree.Callable.Callable): Calls => ({
  parameters: Array.map(parameters, ({ name, forms, descriptions }) => ({
    name,
    forms: formsOf(forms),
    descriptions: describedOf(descriptions),
  })),
  returns: Option.map(returns, ({ forms, descriptions }) => ({
    forms: formsOf(forms),
    descriptions: describedOf(descriptions),
  })),
  throws: Array.map(throws, ({ error, applies, descriptions }) => ({
    error: error.pipe(
      Option.filter((node) => node.type === "inlineCode"),
      Option.map(({ value }) => value),
    ),
    overloads: applies.overloads,
    descriptions: describedOf(descriptions),
  })),
});

/** A member's documented calls beside the summary of the comment that documents them, a getter's and a setter's apart. */
const memberCalls = (
  member: Tree.Member.Member,
): readonly (readonly [string, Option.Option<string>, Calls])[] => {
  if (member.type === "accessor") {
    return Array.map(member.halves, (half) => [
      `${half.type} ${member.name}`,
      Option.flatMap(half.comment, summaryOf),
      callsOf(half),
    ]);
  }

  return [
    [
      member.name,
      Option.flatMap(Array.head(member.comments), summaryOf),
      callsOf(member),
    ],
  ];
};

layer(Reference.layer({ source: Reference.source }), {
  excludeTestServices: true,
})("entry", (it) => {
  it.effect(
    "source_owned_comments",
    Effect.fnUntraced(function* () {
      expect.hasAssertions();
      const reference = yield* Reference.Fixture;
      const own = ownOf(reference, "choose");
      expect(summaries(own)).toStrictEqual([
        [Option.some("First call."), [1]],
        [Option.some("Second call."), [2]],
      ]);
      expect(numbersOf(own.signatures)).toStrictEqual([[1], [2]]);
    }),
  );

  it.effect(
    "deprecation_and_examples",
    Effect.fnUntraced(function* () {
      expect.hasAssertions();
      const reference = yield* Reference.Fixture;
      expect(ownOf(reference, "choose").deprecated).toBe(false);
      expect(ownOf(reference, "old").deprecated).toBe(true);
      const [first] = ownOf(reference, "choose").comments;
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
    }),
  );

  it.effect(
    "call_comments_and_container",
    Effect.fnUntraced(function* () {
      expect.hasAssertions();
      const reference = yield* Reference.Fixture;
      const own = ownOf(reference, "callable");
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
    }),
  );

  it.effect(
    "independent_and_missing_parts",
    Effect.fnUntraced(function* () {
      expect.hasAssertions();
      const reference = yield* Reference.Fixture;
      expect(
        Array.map(
          [
            ownOf(reference, "Pair"),
            ...Option.toArray(valueOf(reference, "Pair")),
          ],
          (own) => [own.meaning, own.kind, summaries(own)],
        ),
      ).toStrictEqual([
        [Option.some("type"), "type", [[Option.some("Type side."), [1]]]],
        [Option.some("value"), "const", [[Option.some("Value side."), [1]]]],
      ]);
      const partial = ownOf(reference, "partial");
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
    }),
  );

  it.effect(
    "type_and_value_apart",
    Effect.fnUntraced(function* () {
      expect.hasAssertions();
      const reference = yield* Reference.success({
        source: `export interface Box { readonly held: string; }
export declare const Box: number;
export declare namespace Box { type Inner = string; }
export interface Run {}
export declare function Run(input: string): Run;
export declare function Run(input: number): Run;
export declare class Joint { readonly held: string; }
export declare const alone: number;
interface Typed {}
declare const Typed: number;
export type { Typed };`,
      });
      expect(
        Array.map(["Box", "Run", "Joint", "alone", "Typed"], (name) => [
          documentedOf(ownOf(reference, name)),
          Option.map(valueOf(reference, name), documentedOf),
        ]),
      ).toStrictEqual([
        [
          [Option.some("type"), "interface", [[1]], ["held"], true],
          Option.some([Option.some("value"), "const", [[1]], [], false]),
        ],
        [
          [Option.some("type"), "interface", [[1]], [], false],
          Option.some([
            Option.some("value"),
            "function",
            [[1], [2]],
            [],
            false,
          ]),
        ],
        [[Option.none(), "class", [[1]], ["held"], false], Option.none()],
        [[Option.none(), "const", [[1]], [], false], Option.none()],
        [[Option.none(), "interface", [[1]], [], false], Option.none()],
      ]);
    }),
  );

  it.effect(
    "member_and_namespace_content",
    Effect.fnUntraced(function* () {
      expect.hasAssertions();
      const reference = yield* Reference.Fixture;
      const own = ownOf(reference, "Model");
      expect(
        Array.map(own.members, (member) => [member.name, member.static]),
      ).toStrictEqual([
        ["make", true],
        ["make", false],
        ["value", false],
      ]);
      expect(
        summaries({
          comments: Tree.Member.comments(
            Array.get(own.members, 2).pipe(Option.getOrThrow),
          ),
        }),
      ).toStrictEqual([
        [Option.some("Getter."), [1]],
        [Option.some("Setter."), [1]],
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
    }),
  );

  it.effect(
    "member_calls",
    Effect.fnUntraced(function* () {
      expect.hasAssertions();
      const reference = yield* Reference.success({
        source: `export class Model {
  /** Getter.
   * @returns The value.
   * @throws \`RangeError\` When empty.
   */
  get value(): string;
  /** Setter.
   * @param input - The new value.
   * @throws \`TypeError\` When frozen.
   */
  set value(input: string | number);
  /** Size. @returns The size. @deprecated Use the value. */
  get size(): number;
  set size(size: number);
  /** Ready. @throws \`Error\` When read early. */
  readonly ready: boolean;
}`,
      });
      const { members } = ownOf(reference, "Model");
      expect(
        Array.map(members, ({ name, deprecated }) => [name, deprecated]),
      ).toStrictEqual([
        ["value", false],
        ["size", true],
        ["ready", false],
      ]);
      expect(Array.flatMap(members, memberCalls)).toStrictEqual([
        [
          "getter value",
          Option.some("Getter."),
          {
            parameters: [],
            returns: Option.some({
              forms: [["string", [1]]],
              descriptions: [["The value.", [1]]],
            }),
            throws: [
              {
                error: Option.some("RangeError"),
                overloads: [1],
                descriptions: [["When empty.", [1]]],
              },
            ],
          },
        ],
        [
          "setter value",
          Option.some("Setter."),
          {
            parameters: [
              {
                name: "input",
                forms: [["string | number", [1]]],
                descriptions: [["The new value.", [1]]],
              },
            ],
            returns: Option.none(),
            throws: [
              {
                error: Option.some("TypeError"),
                overloads: [1],
                descriptions: [["When frozen.", [1]]],
              },
            ],
          },
        ],
        [
          "getter size",
          Option.some("Size."),
          {
            parameters: [],
            returns: Option.some({
              forms: [["number", [1]]],
              descriptions: [["The size.", [1]]],
            }),
            throws: [],
          },
        ],
        [
          "setter size",
          Option.none(),
          { parameters: [], returns: Option.none(), throws: [] },
        ],
        [
          "ready",
          Option.some("Ready."),
          {
            parameters: [],
            returns: Option.none(),
            throws: [
              {
                error: Option.some("Error"),
                overloads: [1],
                descriptions: [["When read early.", [1]]],
              },
            ],
          },
        ],
      ]);
    }),
  );

  it.effect(
    "constructor_member",
    Effect.fnUntraced(function* () {
      expect.hasAssertions();
      const reference = yield* Reference.success({
        source: `/** A box. */
export declare class Box<T> {
  /** The held value. */
  readonly value: T;
  /** Makes a box. @param value - The held value. */
  constructor(value: T);
  /** Makes an empty box. */
  constructor();
}
export declare class Sealed {
  /** Never called. */
  private constructor();
}
declare class Shape {
  /** Makes a shape. */
  constructor();
}
export type { Shape };`,
      });
      const box = ownOf(reference, "Box");
      const made = Array.findFirst(
        box.members,
        ({ name }) => name === "constructor",
      ).pipe(Option.getOrThrow);
      expect([
        // The class's own comment stays the class's, and the constructor's are its member's.
        summaries(box),
        Array.map(box.members, ({ name, type }) => [name, type]),
        Array.map(Tree.Member.comments(made), (comment) => [
          summaryOf(comment),
          comment.applies.overloads,
        ]),
        memberCalls(made),
        // A private constructor is no member, and neither is the constructor of a class exported as a type alone.
        Array.map(ownOf(reference, "Sealed").members, ({ name }) => name),
        Array.map(ownOf(reference, "Shape").members, ({ name }) => name),
      ]).toStrictEqual([
        [[Option.some("A box."), [1]]],
        [
          ["value", "property"],
          ["constructor", "method"],
        ],
        [
          [Option.some("Makes a box."), [1]],
          [Option.some("Makes an empty box."), [2]],
        ],
        [
          [
            "constructor",
            Option.some("Makes a box."),
            {
              parameters: [
                {
                  name: "value",
                  forms: [["T", [1]]],
                  descriptions: [["The held value.", [1]]],
                },
              ],
              returns: Option.none(),
              throws: [],
            },
          ],
        ],
        [],
        [],
      ]);
    }),
  );

  it.effect(
    "interface_calls",
    Effect.fnUntraced(function* () {
      expect.hasAssertions();
      const reference = yield* Reference.success({
        source: `/** Runs things. */
export interface Run {
  /** The name. */
  readonly name: string;
  /** Makes a runner. @param name - Its name. */
  new (name: string): Run;
  /** Runs text. @param text - The text. @returns Nothing. */
  (text: string): void;
  (count: number): void;
}`,
      });
      const run = ownOf(reference, "Run");
      expect([
        summaries(run),
        numbersOf(run.signatures),
        callsOf(run),
        Array.map(run.members, ({ name }) => name),
      ]).toStrictEqual([
        // The interface's own comment documents every call, and each signature's comment its own, in source order.
        [
          [Option.some("Runs things."), [1, 2, 3]],
          [Option.some("Makes a runner."), [1]],
          [Option.some("Runs text."), [2]],
        ],
        [[1, 2, 3]],
        {
          parameters: [
            {
              name: "name",
              forms: [["string", [1]]],
              descriptions: [["Its name.", [1]]],
            },
            {
              name: "text",
              forms: [["string", [2]]],
              descriptions: [["The text.", [2]]],
            },
          ],
          returns: Option.some({
            forms: [
              ["Run", [1]],
              ["void", [2, 3]],
            ],
            descriptions: [["Nothing.", [2]]],
          }),
          throws: [],
        },
        ["name"],
      ]);
    }),
  );

  it.effect(
    "callable_property_calls",
    Effect.fnUntraced(function* () {
      expect.hasAssertions();
      const reference = yield* Reference.success({
        source: `export type Step<S> = (value: S) => void;
export interface Context {
  /** Runs.
   * @param value - The input.
   * @returns The output.
   */
  readonly run: (value: string) => number;
  /** Picks.
   * @param value - The choice.
   */
  readonly pick: { (value: string): string; (value: number, extra: boolean): number };
  /** Steps.
   * @param value - The state.
   */
  readonly step: Step<string>;
  /** Plain. */
  readonly plain: string;
}`,
      });
      const { members } = ownOf(reference, "Context");
      const declared = Array.filter(
        members,
        (member): member is Exclude<Tree.Member.Member, Tree.Member.Accessor> =>
          member.type !== "accessor",
      );
      expect(
        Array.map(declared, (member) => [
          member.name,
          member.type,
          ...numbersOf(Option.some(member.signatures)),
        ]),
      ).toStrictEqual([
        ["run", "method", [1]],
        ["pick", "method", [1, 2]],
        ["step", "method", [1]],
        ["plain", "property", [1]],
      ]);
      expect(Array.flatMap(members, memberCalls)).toStrictEqual([
        [
          "run",
          Option.some("Runs."),
          {
            parameters: [
              {
                name: "value",
                forms: [["string", [1]]],
                descriptions: [["The input.", [1]]],
              },
            ],
            returns: Option.some({
              forms: [["number", [1]]],
              descriptions: [["The output.", [1]]],
            }),
            throws: [],
          },
        ],
        [
          "pick",
          Option.some("Picks."),
          {
            parameters: [
              {
                name: "value",
                forms: [
                  ["string", [1]],
                  ["number", [2]],
                ],
                descriptions: [["The choice.", [1, 2]]],
              },
            ],
            returns: Option.none(),
            throws: [],
          },
        ],
        [
          "step",
          Option.some("Steps."),
          {
            parameters: [
              {
                name: "value",
                forms: [["string", [1]]],
                descriptions: [["The state.", [1]]],
              },
            ],
            returns: Option.none(),
            throws: [],
          },
        ],
        [
          "plain",
          Option.some("Plain."),
          { parameters: [], returns: Option.none(), throws: [] },
        ],
      ]);
    }),
  );

  it.effect(
    "renamed_export",
    Effect.fnUntraced(function* () {
      expect.hasAssertions();
      const reference = yield* Reference.success({
        source:
          "declare class Internal { clone(): Internal; }\nexport { Internal as Public };",
      });
      const syntax = syntaxOf(reference, ["Public"]);
      expect(Array.map(syntax, shapeOf)).toStrictEqual([
        ["class", "Internal"],
        ["export", "Internal Public"],
      ]);
      expect(
        pipe(
          syntax,
          Array.flatMap(TypeScript.Node.identifiers),
          Array.map(({ text }) => text),
        ),
      ).toStrictEqual(["Internal", "clone", "Internal", "Internal", "Public"]);
    }),
  );

  it.effect(
    "default_export",
    Effect.fnUntraced(function* () {
      expect.hasAssertions();
      const reference = yield* Reference.success({
        source: [
          'export { default as Original } from "./original.js";',
          'export { default as Renamed } from "./renamed.js";',
        ].join("\n"),
        files: {
          "original.d.ts": "export default class Original {}",
          "renamed.d.ts": "export default class Hidden {}",
        },
      });
      expect(
        Array.map(syntaxOf(reference, ["Original"]), shapeOf),
      ).toStrictEqual([["class", "Original", SyntaxKind.ExportKeyword]]);
      expect(
        Array.map(syntaxOf(reference, ["Renamed"]), shapeOf),
      ).toStrictEqual([
        ["class", "Hidden"],
        ["export", "Hidden Renamed"],
      ]);
    }),
  );

  it.effect.each<
    readonly [
      Reference.Options,
      readonly string[],
      readonly (readonly (string | number)[])[],
    ]
  >([
    [
      { source: "export default class Original {}\nexport { Original };" },
      ["default"],
      [
        ["class", "Original", SyntaxKind.ExportKeyword],
        ["export", "Original default"],
      ],
    ],
    [
      {
        source:
          "declare class Internal {}\nexport { Internal as Public, Internal as Other };",
      },
      ["Public"],
      [
        ["class", "Internal"],
        ["export", "Internal Public", "Internal Other"],
      ],
    ],
    [
      {
        source:
          "declare class Value {}\nexport { Value };\nexport type { Value as Shape };",
      },
      ["Value"],
      [
        ["class", "Value", SyntaxKind.ExportKeyword],
        ["export type", "Value Shape"],
      ],
    ],
    [
      {
        source:
          "declare class Value {}\nexport { Value as Other };\nexport type { Value as Shape };",
      },
      ["Other"],
      [
        ["class", "Value"],
        ["export", "Value Other", "type Value Shape"],
      ],
    ],
    [
      {
        source:
          "declare class Value {}\nexport type { Value, Value as Shape };",
      },
      ["Value"],
      [
        ["class", "Value"],
        ["export type", "Value Value", "Value Shape"],
      ],
    ],
    [
      {
        source: 'export type * as Values from "./values.js";',
        files: {
          "values.d.ts":
            "export declare class Value {}\nexport { Value as Again };",
        },
      },
      ["Values", "Value"],
      [
        ["class", "Value"],
        ["export type", "Value Value", "Value Again"],
      ],
    ],
  ])(
    "export_names_%#",
    Effect.fnUntraced(function* ([options, path, expected]) {
      expect.hasAssertions();
      const reference = yield* Reference.success(options);
      expect(Array.map(syntaxOf(reference, path), shapeOf)).toStrictEqual(
        expected,
      );
    }),
  );

  it.effect(
    "linked_signatures",
    Effect.fnUntraced(function* () {
      expect.hasAssertions();
      const reference = yield* Reference.Fixture;
      const { ast } = reference.document.catalogue;
      const value = Reference.id(reference, ["Value"]);
      const names = pipe(
        Option.toArray(ownOf(reference, "choose").signatures),
        Array.flatMap(({ children }) => children),
        Array.flatMap(({ syntax }) =>
          Array.flatMap(syntax, TypeScript.Node.identifiers),
        ),
        Array.filter(({ text }) => text === "Value"),
      );
      expect(names).toHaveLength(4);
      expect(Array.map(names, References.namesOf(ast))).toStrictEqual(
        Array.makeBy(4, () => Option.some(value)),
      );
    }),
  );
});
