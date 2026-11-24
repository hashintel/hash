import { Data, Function, HashMap, Match, Option } from "effect";

import * as AST from "./AST/index.js";

/** A reusable interface, explained by the reference itself or by its own comment. */
export type Trait = Data.TaggedEnum<{
  Explained: {
    readonly explanation: string;
    readonly guide: Option.Option<URL>;
  };
  Declared: { readonly documentation: AST.Documentation.Documentation };
}>;

export const { Explained, Declared, $match: match } = Data.taggedEnum<Trait>();

/** Effect's interfaces that the package's types implement, explained by their qualified names. */
export const explained: HashMap.HashMap<string, Trait> = HashMap.make(
  [
    "Pipeable.Pipeable",
    Explained({
      explanation: "Chains functions with `pipe`: `x.pipe(f, g)` is `g(f(x))`.",
      guide: Option.none(),
    }),
  ],
  [
    "Equal.Equal",
    Explained({
      explanation:
        "Compares by value: `Equal.equals(a, b)` compares what two values hold, not whether they are the same object.",
      guide: Option.some(new URL("https://effect.website/docs/trait/equal/")),
    }),
  ],
  [
    "Hash.Hash",
    Explained({
      explanation:
        "Hashes by value, so it can be a key of a `HashMap` or a member of a `HashSet`.",
      guide: Option.some(new URL("https://effect.website/docs/trait/hash/")),
    }),
  ],
  [
    "Inspectable.Inspectable",
    Explained({
      explanation:
        "Prints what it holds: `toString`, `toJSON` and Node's `inspect` show its contents.",
      guide: Option.none(),
    }),
  ],
);

type NamedType =
  | AST.ClassDeclaration.ClassDeclaration
  | AST.InterfaceDeclaration.InterfaceDeclaration;

const namedType = (
  ast: AST.Store["Service"],
  declaration: AST.Declaration.Declaration,
): Option.Option<NamedType> =>
  declaration.leaf.pipe(
    Option.map(ast.get),
    Option.flatMap((leaf) =>
      Match.value(leaf).pipe(
        Match.tag("JointDeclaration", ({ declaration: joint }) =>
          Option.liftPredicate(
            ast.get(joint),
            AST.ClassDeclaration.isClassDeclaration,
          ),
        ),
        Match.tag("IndependentDeclarations", ({ type }) =>
          type.pipe(
            Option.map(ast.get),
            Option.filter(AST.InterfaceDeclaration.isInterfaceDeclaration),
          ),
        ),
        Match.exhaustive,
      ),
    ),
  );

/** The class or interface a declaration declares, which alone can be a base or a trait. */
export const namedTypeOf: {
  (
    declaration: AST.Declaration.Declaration,
  ): (ast: AST.Store["Service"]) => Option.Option<NamedType>;
  (
    ast: AST.Store["Service"],
    declaration: AST.Declaration.Declaration,
  ): Option.Option<NamedType>;
} = Function.dual(2, namedType);

/** The trait a local class or interface declares by its comment's `@trait`, or none for one that declares no trait. */
export const declaredBy: {
  (
    declaration: AST.Declaration.Declaration,
  ): (ast: AST.Store["Service"]) => Option.Option<Trait>;
  (
    ast: AST.Store["Service"],
    declaration: AST.Declaration.Declaration,
  ): Option.Option<Trait>;
} = Function.dual(
  2,
  (
    ast: AST.Store["Service"],
    declaration: AST.Declaration.Declaration,
  ): Option.Option<Trait> =>
    namedType(ast, declaration).pipe(
      Option.flatMap(({ documentation }) => documentation),
      Option.map(ast.get),
      Option.filter(({ trait }) => Option.isSome(trait)),
      Option.map((documentation) => Declared({ documentation })),
    ),
);
