import { Array, Function, Match, Number, Option, pipe } from "effect";

import type * as AST from "../AST/index.js";
import type * as Catalogue from "../Catalogue.js";

/** A node of the AST that a reader sees as one declaration, printed with the comment beside it. */
export type Source =
  | AST.ClassDeclaration.ClassDeclaration
  | AST.EnumDeclaration.EnumDeclaration
  | AST.TypeDeclaration.TypeDeclaration
  | AST.ConstantDeclaration.ConstantDeclaration
  | AST.CallableConstant.CallableConstant
  | AST.CallSignature.CallSignature
  | AST.ConstructSignature.ConstructSignature
  | AST.Property.Property
  | AST.CallableProperty.CallableProperty
  | AST.Getter.Getter
  | AST.Setter.Setter
  | AST.EnumMember.EnumMember
  | AST.IndexSignature.IndexSignature;

/** One declaration a reader sees, with the calls it numbers. An overload of a function or of a method numbers its own call, and a callable constant or property numbers every call of its type. */
export interface Part {
  readonly source: Source;
  readonly calls: readonly AST.CallSignature.CallSignature[];
}

/** A member and its declarations. Static and instance members with the same name stay two members. */
export interface Member {
  readonly id: AST.Member.Interned;
  readonly name: string;
  readonly static: boolean;
  readonly parts: readonly Part[];
}

/** The names a declaration or a call declares as parameters and as type parameters. */
export interface Declared {
  readonly parameters: readonly string[];
  readonly typeParameters: readonly string[];
}

const declaredBy = (ast: AST.Store["Service"], source: Source): Declared => {
  const parameters: string[] = [];
  const typeParameters: string[] = [];
  if ("parameters" in source) {
    for (const id of source.parameters) {
      parameters.push(ast.get(id).name);
    }
  }
  if ("typeParameters" in source) {
    for (const id of source.typeParameters) {
      typeParameters.push(ast.get(id).name);
    }
  }

  return { parameters, typeParameters };
};

/** The names `source` declares, such as a call's parameters, a setter's parameter or a type alias's type parameters. A declaration without one of the lists declares none there. */
export const declared: {
  (source: Source): (ast: AST.Store["Service"]) => Declared;
  (ast: AST.Store["Service"], source: Source): Declared;
} = Function.dual(2, declaredBy);

const plain = (source: Source): Part => ({
  source,
  calls: [],
});

const call = (source: AST.CallSignature.CallSignature): Part => ({
  source,
  calls: [source],
});

/** A callable constant or property keeps its calls together under its own declaration, and a function or a method declares each overload apart. */
const callableParts = (
  ast: AST.Store["Service"],
  source: AST.FunctionDeclaration.FunctionDeclaration | AST.Method.Method,
): readonly Part[] => {
  const calls = pipe(source.overloads, Array.fromIterable, Array.map(ast.get));
  if (source.flavour === "const" || source.flavour === "property") {
    return [{ source, calls }];
  }
  return Array.map(calls, call);
};

const valueParts = (
  ast: AST.Store["Service"],
  value: AST.ValueDeclaration.ValueDeclaration,
): readonly Part[] =>
  Match.value(value).pipe(
    Match.tag("ConstantDeclaration", (source) => [plain(source)]),
    Match.tag("FunctionDeclaration", (source) => callableParts(ast, source)),
    Match.exhaustive,
  );

const partsOf = (
  ast: AST.Store["Service"],
  entry: Catalogue.Entry,
): readonly Part[] => {
  const leaf = ast.get(entry.id).leaf.pipe(Option.map(ast.get));
  if (Option.isNone(leaf)) {
    return [];
  }
  return Match.value(leaf.value).pipe(
    Match.tag("JointDeclaration", ({ declaration }) => [
      plain(ast.get(declaration)),
    ]),
    Match.tag("IndependentDeclarations", ({ type, value }) => {
      const types = pipe(
        type,
        Option.map(ast.get),
        Option.map(plain),
        Option.toArray,
      );
      // A type-only export can still expose a value's type through `typeof`.
      if (entry.typeOnlyExport && Option.isSome(type)) {
        return types;
      }
      const values = pipe(
        value,
        Option.map(ast.get),
        Option.map((source) => valueParts(ast, source)),
        Option.getOrElse((): readonly Part[] => []),
      );
      return Array.appendAll(types, values);
    }),
    Match.exhaustive,
  );
};

const memberParts = (
  ast: AST.Store["Service"],
  member: AST.Member.Member,
): readonly Part[] =>
  Match.value(member).pipe(
    Match.tag("Method", (source) => callableParts(ast, source)),
    Match.tag("Accessor", ({ get, set }) =>
      pipe(
        Array.appendAll(
          get.pipe(Option.map(ast.get), Option.map(plain), Option.toArray),
          set.pipe(Option.map(ast.get), Option.map(plain), Option.toArray),
        ),
        Array.sortWith((part: Part) => part.source.node.pos, Number.Order),
      ),
    ),
    Match.tag("Constructor", ({ overloads }) =>
      pipe(overloads, Array.fromIterable, Array.map(ast.get), Array.map(plain)),
    ),
    Match.tag("CallSignature", (source) => [call(source)]),
    Match.tag(
      "Property",
      "EnumMember",
      "ConstructSignature",
      "IndexSignature",
      (source) => [plain(source)],
    ),
    Match.exhaustive,
  );

/** The declarations of an export, type first. A type-only export shows its type alone. */
export const of: {
  (entry: Catalogue.Entry): (ast: AST.Store["Service"]) => readonly Part[];
  (ast: AST.Store["Service"], entry: Catalogue.Entry): readonly Part[];
} = Function.dual(2, partsOf);

interface Owner {
  readonly ast: AST.Store["Service"];
  readonly entry: Catalogue.Entry;
}

const membersOf = (
  parts: readonly Part[],
  { ast, entry }: Owner,
): readonly Member[] => {
  const found = Array.flatMap(parts, ({ source }): readonly Member[] => {
    if (
      source._tag !== "ClassDeclaration" &&
      source._tag !== "InterfaceDeclaration" &&
      source._tag !== "EnumDeclaration"
    ) {
      return [];
    }
    return pipe(
      source.members,
      Array.fromIterable<AST.Member.Interned>,
      Array.flatMap((id): readonly Member[] => {
        const member = ast.get(id);
        if (
          member._tag === "Constructor" ||
          member._tag === "IndexSignature" ||
          member._tag === "CallSignature" ||
          member._tag === "ConstructSignature"
        ) {
          return [];
        }
        const isStatic = member._tag !== "EnumMember" && member.static;
        if (entry.typeOnlyExport && isStatic) {
          return [];
        }
        return [
          {
            id,
            name: member.name,
            static: isStatic,
            parts: memberParts(ast, member),
          },
        ];
      }),
    );
  });
  // The first source occurrence determines each overload group's display order.
  return Array.sortWith(
    found,
    (member) => member.parts[0]?.source.node.pos ?? 0,
    Number.Order,
  );
};

/** The named members of the classes, interfaces and enums among `parts`, in source order. A type-only export has no static members, because a type-only import gives no value to call them on. */
export const members: {
  (owner: Owner): (parts: readonly Part[]) => readonly Member[];
  (parts: readonly Part[], owner: Owner): readonly Member[];
} = Function.dual(2, membersOf);
