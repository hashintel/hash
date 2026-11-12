import {
  Array,
  Chunk,
  Context,
  Data,
  Effect,
  Function,
  Iterable,
  Layer,
  Option,
  Result,
  flow,
  pipe,
} from "effect";
import * as Syntax from "typescript/ast";

import * as AST from "../AST/index.js";
import * as TypeScript from "../TypeScript/index.js";
import * as Comments from "./ast-comments.js";
import * as Constants from "./ast-constants.js";
import * as Types from "./ast-type-parser.js";
import * as Source from "./ast/source.js";

import type * as Names from "./ast-names.js";
import type { Failure } from "./ast-type-parser.js";
import type { Symbol as CompilerSymbol } from "typescript/async";

type ValueSource = Data.TaggedEnum<{
  Function: {
    readonly nodes: Array.NonEmptyReadonlyArray<Syntax.FunctionDeclaration>;
  };
  Variable: { readonly node: Syntax.VariableDeclaration };
}>;
const ValueSource = Data.taggedEnum<ValueSource>();

type Group = Data.TaggedEnum<{
  Class: { readonly node: Syntax.ClassDeclaration };
  Enum: { readonly node: Syntax.EnumDeclaration };
  Independent: {
    readonly type: Option.Option<
      Syntax.TypeAliasDeclaration | Syntax.InterfaceDeclaration
    >;
    readonly value: Option.Option<ValueSource>;
  };
}>;
const Group = Data.taggedEnum<Group>();

const unsupportedMerge = (
  symbol: CompilerSymbol,
  kinds: readonly string[],
): Result.Result<never, AST.ParseError.ParseError> =>
  Result.fail(AST.ParseError.unsupportedMerge({ name: symbol.name, kinds }));

const classify = (
  symbol: CompilerSymbol,
  nodes: Iterable<Syntax.Declaration>,
): Result.Result<Option.Option<Group>, AST.ParseError.ParseError> => {
  const declarations = Array.fromIterable(nodes);
  const kinds = Array.map(declarations, (node) => Syntax.SyntaxKind[node.kind]);

  return Iterable.reduce(
    declarations,
    Result.succeedNone,
    (
      accumulated: Result.Result<
        Option.Option<Group>,
        AST.ParseError.ParseError
      >,
      node,
    ): Result.Result<Option.Option<Group>, AST.ParseError.ParseError> => {
      if (accumulated._tag === "Failure") {
        return accumulated;
      }

      const group = accumulated.success;

      if (Syntax.isClassDeclaration(node)) {
        if (group._tag === "None") {
          return Result.succeedSome(Group.Class({ node }));
        }

        return unsupportedMerge(symbol, kinds);
      }

      if (Syntax.isEnumDeclaration(node)) {
        if (group._tag === "None") {
          return Result.succeedSome(Group.Enum({ node }));
        }

        return unsupportedMerge(symbol, kinds);
      }

      let type: Option.Option<
        Syntax.TypeAliasDeclaration | Syntax.InterfaceDeclaration
      > = Option.none();
      let value: Option.Option<ValueSource> = Option.none();

      if (group._tag === "Some") {
        switch (group.value._tag) {
          case "Class":
          case "Enum": {
            return unsupportedMerge(symbol, kinds);
          }
          case "Independent": {
            type = group.value.type;
            value = group.value.value;
            break;
          }
        }
      }

      if (
        Syntax.isTypeAliasDeclaration(node) ||
        Syntax.isInterfaceDeclaration(node)
      ) {
        if (type._tag === "Some") {
          return unsupportedMerge(symbol, kinds);
        }

        return Result.succeedSome(
          Group.Independent({ type: Option.some(node), value }),
        );
      }

      if (Syntax.isFunctionDeclaration(node)) {
        const previous = value.valueOrUndefined;

        if (previous !== undefined && ValueSource.$is("Variable")(previous)) {
          return unsupportedMerge(symbol, kinds);
        }

        const functions = Array.append(previous?.nodes ?? [], node);

        return Result.succeedSome(
          Group.Independent({
            type,
            value: Option.some(ValueSource.Function({ nodes: functions })),
          }),
        );
      }

      if (Syntax.isVariableDeclaration(node)) {
        if (value._tag === "Some") {
          return unsupportedMerge(symbol, kinds);
        }

        return Result.succeedSome(
          Group.Independent({
            type,
            value: Option.some(ValueSource.Variable({ node })),
          }),
        );
      }

      return Result.fail(
        AST.ParseError.unsupportedDeclaration({ name: symbol.name, kinds }),
      );
    },
  );
};

export class DeclarationParser extends Context.Service<
  DeclarationParser,
  DeclarationParser.Shape
>()("@local/hashql-docs/internal/ast-declarations/DeclarationParser") {}

export declare namespace DeclarationParser {
  export interface Shape extends Effect.Success<typeof make> {}
}

type Requirements =
  | AST.Store
  | Types.TypeParser
  | Names.Reach
  | Comments.CommentParser
  | TypeScript.Checker.Checker
  | TypeScript.Program.Program;

type Parsed<A> = Effect.Effect<A, Failure, Requirements>;

const typeParametersOf = (
  node:
    | Syntax.ClassDeclaration
    | Syntax.TypeAliasDeclaration
    | Syntax.InterfaceDeclaration,
): Parsed<Chunk.Chunk<AST.TypeParameter.Interned>> =>
  pipe(
    Types.typeParameters(node.typeParameters ?? []),
    Effect.map(Chunk.fromIterable),
  );

const classDeclaration = (
  node: Syntax.ClassDeclaration,
): Parsed<AST.ClassDeclaration.Interned> =>
  Effect.all({
    node: Effect.succeed(node),
    typeParameters: typeParametersOf(node),
    extends: Types.optional(
      Array.head(Source.heritageOf(node, Syntax.SyntaxKind.ExtendsKeyword)),
    ),
    implements: pipe(
      Source.heritageOf(node, Syntax.SyntaxKind.ImplementsKeyword),
      Effect.forEach(Types.type),
      Effect.map(Chunk.fromIterable),
    ),
    members: Types.classMembers(node.members),
    documentation: Comments.documentation(node),
  }).pipe(Effect.map(AST.ClassDeclaration.make), Effect.flatMap(AST.intern));

const enumMember = (
  member: Syntax.EnumMember,
): Parsed<AST.EnumMember.Interned> =>
  Effect.flatMap(TypeScript.Checker.getSymbolOfDeclaration(member), (symbol) =>
    AST.reserveSymbol([symbol], () =>
      Effect.map(Comments.documentation(member), (documentation) =>
        AST.EnumMember.make({
          node: member,
          name: Source.nameOf(member.name),
          documentation,
        }),
      ),
    ),
  );

const enumDeclaration = (
  node: Syntax.EnumDeclaration,
): Parsed<AST.EnumDeclaration.Interned> =>
  Effect.all({
    node: Effect.succeed(node),
    members: pipe(
      node.members,
      Effect.forEach(enumMember),
      Effect.map(Chunk.fromIterable),
    ),
    documentation: Comments.documentation(node),
  }).pipe(Effect.map(AST.EnumDeclaration.make), Effect.flatMap(AST.intern));

const typeDeclaration = (
  node: Syntax.TypeAliasDeclaration | Syntax.InterfaceDeclaration,
): Parsed<AST.TypeDeclaration.Interned> => {
  if (Syntax.isTypeAliasDeclaration(node)) {
    return Effect.all({
      node: Effect.succeed(node),
      typeParameters: typeParametersOf(node),
      documentation: Comments.documentation(node),
      type: Types.type(node.type),
    }).pipe(
      Effect.map(AST.TypeAliasDeclaration.make),
      Effect.flatMap(AST.intern),
    );
  }

  return Effect.all({
    node: Effect.succeed(node),
    typeParameters: typeParametersOf(node),
    documentation: Comments.documentation(node),
    extends: pipe(
      node.heritageClauses ?? [],
      Array.flatMap((clause) => clause.types),
      Effect.forEach(Types.type),
      Effect.map(Chunk.fromIterable),
    ),
    members: Types.typeMembers(node.members),
  }).pipe(
    Effect.map(AST.InterfaceDeclaration.make),
    Effect.flatMap(AST.intern),
  );
};

const valueDeclaration = (
  symbol: CompilerSymbol,
  source: ValueSource,
): Parsed<AST.ValueDeclaration.Interned> =>
  ValueSource.$match(source, {
    Function: ({ nodes }) =>
      pipe(
        Effect.forEach(nodes, Types.call),
        Effect.map((overloads) =>
          AST.FunctionOverloads.make({ overloads: Chunk.make(...overloads) }),
        ),
        Effect.flatMap(AST.intern),
      ),
    Variable: ({ node }) =>
      Constants.variable(symbol, node).pipe(Effect.flatMap(AST.intern)),
  });

/** A class or an enum gives a symbol both meanings through one declaration. */
const joint = (
  declaration: Parsed<AST.JointDeclaration.JointDeclaration["declaration"]>,
): Parsed<Option.Option<AST.LeafDeclaration.Interned>> =>
  declaration.pipe(
    Effect.map((id) => AST.JointDeclaration.make({ declaration: id })),
    Effect.flatMap(AST.intern),
    Effect.asSome,
  );

/** Type and value meanings declared apart, either of which may be absent. */
const independent = (
  symbol: CompilerSymbol,
  {
    type,
    value,
  }: {
    readonly type: Option.Option<
      Syntax.TypeAliasDeclaration | Syntax.InterfaceDeclaration
    >;
    readonly value: Option.Option<ValueSource>;
  },
): Parsed<Option.Option<AST.LeafDeclaration.Interned>> =>
  Effect.all({
    type: Effect.transposeOption(Option.map(type, typeDeclaration)),
    value: Effect.transposeOption(
      Option.map(value, (source) => valueDeclaration(symbol, source)),
    ),
  }).pipe(
    Effect.flatMap(
      (fields): Parsed<Option.Option<AST.LeafDeclaration.Interned>> => {
        if (Option.isNone(fields.type) && Option.isNone(fields.value)) {
          return Effect.succeedNone;
        }

        return pipe(
          AST.IndependentDeclarations.make(fields),
          AST.intern,
          Effect.asSome,
        );
      },
    ),
  );

const parseImpl = (
  symbol: CompilerSymbol,
  nodes: readonly Syntax.Declaration[],
): Parsed<Option.Option<AST.LeafDeclaration.Interned>> =>
  pipe(
    Effect.fromResult(classify(symbol, nodes)),
    Effect.flatMap(
      (classified): Parsed<Option.Option<AST.LeafDeclaration.Interned>> =>
        Option.match(classified, {
          onNone: () => Effect.succeedNone,
          onSome: (group) =>
            Group.$match(group, {
              Class: ({ node }) => joint(classDeclaration(node)),
              Enum: ({ node }) => joint(enumDeclaration(node)),
              Independent: (declarations) => independent(symbol, declarations),
            }),
        }),
    ),
  );

const make = Effect.context<
  Exclude<Requirements, AST.Store | Names.Reach>
>().pipe(
  Effect.map((context) => ({
    parse: flow(parseImpl, Effect.provide(context)),
  })),
);

export const layer = Layer.effect(DeclarationParser, make);

/** The leaf declaration a symbol's declarations form, or none when only namespaces declare it. */
export const parse: {
  (
    nodes: readonly Syntax.Declaration[],
  ): (
    symbol: CompilerSymbol,
  ) => Effect.Effect<
    Option.Option<AST.LeafDeclaration.Interned>,
    Failure,
    DeclarationParser | AST.Store | Names.Reach
  >;
  (
    symbol: CompilerSymbol,
    nodes: readonly Syntax.Declaration[],
  ): Effect.Effect<
    Option.Option<AST.LeafDeclaration.Interned>,
    Failure,
    DeclarationParser | AST.Store | Names.Reach
  >;
} = Function.dual(
  2,
  (symbol: CompilerSymbol, nodes: readonly Syntax.Declaration[]) =>
    Effect.flatMap(DeclarationParser, (parser) => parser.parse(symbol, nodes)),
);
