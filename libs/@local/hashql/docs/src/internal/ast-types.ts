import { Array, Chunk, Context, Effect, Layer, Option, pipe } from "effect";
import * as Syntax from "typescript/ast";

import * as AST from "../AST/index.js";
import * as TypeScript from "../TypeScript/index.js";
import * as Comments from "./ast-comments.js";
import * as Members from "./ast-members.js";
import * as Names from "./ast-names.js";
import * as Types from "./ast-type-parser.js";

import type { Failure, TypeSource } from "./ast-type-parser.js";
import type { Cause, Data } from "effect";
import type { Symbol as CompilerSymbol } from "typescript/async";

/** The identity each syntax node parsed to, so it parses once. */
interface Cache {
  readonly types: WeakMap<TypeSource, AST.TypeNode.Interned>;
  readonly parameters: WeakMap<
    Syntax.ParameterDeclaration,
    AST.Parameter.Interned
  >;
  readonly typeParameters: WeakMap<
    Syntax.TypeParameterDeclaration,
    AST.TypeParameter.Interned
  >;
}

class TypeParserState extends Context.Service<TypeParserState, Cache>()(
  "@local/hashql-docs/internal/ast-types/TypeParserState",
) {}

type Requirements = Members.Requirements | TypeParserState | Types.TypeParser;

type Parsed<A> = Effect.Effect<A, Failure, Requirements>;

/** Converts syntax without expanding the types its names refer to. */
const referenceName = (
  node: AST.TypeReference.TypeReference["node"],
): Syntax.Node => {
  if (Syntax.isTypeReferenceNode(node)) {
    return node.typeName;
  }

  if (Syntax.isTypeQueryNode(node)) {
    return node.exprName;
  }

  if (Syntax.isExpressionWithTypeArguments(node)) {
    return node.expression;
  }

  return node.qualifier ?? node;
};

/** The names of a dotted name in source order, `A`, `B` and `C` for `A.B.C`. */
const segments = (
  name: Syntax.Node,
): Array.NonEmptyReadonlyArray<Syntax.Node> => {
  if (Syntax.isQualifiedName(name)) {
    return Array.append(segments(name.left), name.right);
  }

  if (Syntax.isPropertyAccessExpression(name)) {
    return Array.append(segments(name.expression), name.name);
  }

  return [name];
};

/** The names in front of a reference's target in source order, with the module of an import type that reads a name from it first. */
const qualifiersOf = (
  node: AST.TypeReference.TypeReference["node"],
): readonly Syntax.Node[] => {
  const qualifiers = Array.initNonEmpty(segments(referenceName(node)));

  if (
    Syntax.isImportTypeNode(node) &&
    node.qualifier !== undefined &&
    Syntax.isLiteralTypeNode(node.argument)
  ) {
    return Array.prepend(qualifiers, node.argument.literal);
  }

  return qualifiers;
};

/** Reserves the identity `symbols` name and builds its node with `parse`, or an identity no symbol names when there are none. */
const reserveNamed = <T extends AST.Target.Local>(
  symbols: Parsed<readonly CompilerSymbol[]>,
  parse: (id: AST.Interned.Interned<T>) => Parsed<T>,
): Parsed<AST.Interned.Interned<T>> =>
  Effect.flatMap(symbols, (named) => {
    if (Array.isReadonlyArrayNonEmpty(named)) {
      return AST.reserveSymbol(named, parse);
    }

    return AST.reserve(parse);
  });

/** The identity `key` parses to, reserved before parsing so names inside it can refer to it. A key parses once. */
const reserved = <K extends WeakKey, T extends AST.Node.Node>(
  cache: WeakMap<K, AST.Interned.Interned<T>>,
  key: K,
  reservation: Parsed<AST.Interned.Interned<T>>,
): Parsed<AST.Interned.Interned<T>> => {
  const existing = cache.get(key);

  if (existing !== undefined) {
    return Effect.succeed(existing);
  }

  return Effect.tap(reservation, (id) =>
    Effect.sync(() => {
      cache.set(key, id);
    }),
  );
};

const optionalImpl = (
  node: Option.Option<TypeSource>,
): Parsed<Option.Option<AST.TypeNode.Interned>> =>
  Effect.transposeOption(Option.map(node, Types.type));

const typeParameterImpl = (
  node: Syntax.TypeParameterDeclaration,
): Parsed<AST.TypeParameter.Interned> =>
  Effect.flatMap(TypeParserState, ({ typeParameters }) =>
    reserved(
      typeParameters,
      node,
      reserveNamed(
        Effect.map(TypeScript.Checker.getSymbolOfDeclaration(node), Array.of),
        () =>
          Effect.all({
            constraint: Types.optional(Option.fromUndefinedOr(node.constraint)),
            default: Types.optional(Option.fromUndefinedOr(node.defaultType)),
            documentation: Comments.documentation(node),
          }).pipe(
            Effect.map((fields) =>
              AST.TypeParameter.make({ node, name: node.name.text, ...fields }),
            ),
          ),
      ),
    ),
  );

/** The symbols a parameter's name declares: its own, or for a destructured parameter one for each name it binds. */
const parameterSymbols = Effect.fnUntraced(function* (
  node: Syntax.ParameterDeclaration,
): Effect.fn.Return<
  readonly CompilerSymbol[],
  Cause.UnknownError,
  TypeScript.Checker.Checker
> {
  if (!Syntax.isBindingPattern(node.name)) {
    return [yield* TypeScript.Checker.getSymbolOfDeclaration(node)];
  }

  const symbols: CompilerSymbol[] = [];
  const pending: Syntax.Node[] = [node.name];

  while (pending.length > 0) {
    const current = pending.pop();

    if (
      current !== undefined &&
      Syntax.isBindingElement(current) &&
      current.name !== undefined &&
      Syntax.isIdentifier(current.name)
    ) {
      symbols.push(yield* TypeScript.Checker.getSymbolOfDeclaration(current));
    } else if (current !== undefined) {
      pending.push(...current.childrenIter());
    }
  }

  return symbols;
});

const parameterImpl = (
  node: Syntax.ParameterDeclaration,
): Parsed<AST.Parameter.Interned> =>
  Effect.flatMap(TypeParserState, ({ parameters }) =>
    reserved(
      parameters,
      node,
      reserveNamed(parameterSymbols(node), () =>
        Effect.all({
          type: Types.optional(Option.fromUndefinedOr(node.type)),
          documentation: Comments.documentation(node),
        }).pipe(
          Effect.map((fields) =>
            AST.Parameter.make({
              node,
              name: node.name.getText(),
              optional:
                node.questionToken !== undefined ||
                node.initializer !== undefined,
              rest: node.dotDotDotToken !== undefined,
              ...fields,
            }),
          ),
        ),
      ),
    ),
  );

const signatureImpl = (
  node: Syntax.SignatureDeclaration,
): Parsed<AST.Signature.Signature> =>
  Effect.all({
    typeParameters: pipe(
      node.typeParameters ?? [],
      Effect.forEach(Types.typeParameter),
      Effect.map(Chunk.fromIterable),
    ),
    parameters: pipe(
      node.parameters,
      Effect.forEach(Types.parameter),
      Effect.map(Chunk.fromIterable),
    ),
    returns: Types.optional(Option.fromUndefinedOr(node.type)),
  });

const callImpl = (
  node: AST.CallSignature.CallSignature["node"],
): Parsed<AST.CallSignature.Interned> =>
  Types.signed(node).pipe(
    Effect.map(AST.CallSignature.make),
    Effect.flatMap(AST.intern),
  );

const constructImpl = (
  node: AST.ConstructSignature.ConstructSignature["node"],
): Parsed<AST.ConstructSignature.Interned> =>
  Types.signed(node).pipe(
    Effect.map(AST.ConstructSignature.make),
    Effect.flatMap(AST.intern),
  );

/** A part of a type expression the AST keeps: a nested type, a type parameter it declares, or the name a type predicate tests. */
type ExpressionPart = Data.TaggedEnum<{
  Type: { readonly node: Syntax.TypeNode };
  TypeParameter: {
    readonly node: Syntax.TypeParameterDeclaration;
  };
  Reference: { readonly node: Syntax.Identifier };
}>;

/** The parts of a type expression in source order, without descending into a part. */
const expressionParts = (node: Syntax.Node): readonly ExpressionPart[] =>
  Array.flatMap(
    Array.fromIterable(node.childrenIter()),
    (child): readonly ExpressionPart[] => {
      if (Syntax.isTypeNode(child)) {
        return [{ _tag: "Type", node: child }];
      }

      if (Syntax.isTypeParameterDeclaration(child)) {
        return [{ _tag: "TypeParameter", node: child }];
      }

      if (
        Syntax.isIdentifier(child) &&
        Syntax.isTypePredicateNode(child.parent)
      ) {
        return [{ _tag: "Reference", node: child }];
      }

      return expressionParts(child);
    },
  );

type ParsedPart = Data.TaggedEnum<{
  Child: {
    readonly id: AST.Interned.Interned<
      AST.TypeNode.TypeNode | AST.TypeParameter.TypeParameter
    >;
  };
  Reference: { readonly target: AST.Target.InternedSymbol };
}>;

const parsePart = (part: ExpressionPart): Parsed<ParsedPart> => {
  switch (part._tag) {
    case "Type": {
      return Types.type(part.node).pipe(
        Effect.map((id) => ({ _tag: "Child" as const, id })),
      );
    }
    case "TypeParameter": {
      return Types.typeParameter(part.node).pipe(
        Effect.map((id) => ({ _tag: "Child" as const, id })),
      );
    }
    case "Reference": {
      return Names.required(part.node).pipe(
        Effect.map((target) => ({ _tag: "Reference" as const, target })),
      );
    }
  }
};

/** Any other type syntax keeps the types and names inside it, parsed in source order. */
const expression = (
  node: AST.TypeExpression.TypeExpression["node"],
): Parsed<AST.TypeExpression.TypeExpression> =>
  pipe(
    expressionParts(node),
    Effect.forEach(parsePart),
    Effect.map((parts) =>
      AST.TypeExpression.make({
        node,
        children: Chunk.fromIterable(
          Array.flatMap(parts, (part) =>
            part._tag === "Child" ? [part.id] : [],
          ),
        ),
        references: Chunk.fromIterable(
          Array.flatMap(parts, (part) =>
            part._tag === "Reference" ? [part.target] : [],
          ),
        ),
      }),
    ),
  );

/** Converts syntax without expanding the types its names refer to. */
const typeNode = (node: TypeSource): Parsed<AST.TypeNode.TypeNode> => {
  if (
    Syntax.isTypeReferenceNode(node) ||
    Syntax.isTypeQueryNode(node) ||
    Syntax.isImportTypeNode(node) ||
    Syntax.isExpressionWithTypeArguments(node)
  ) {
    return Effect.all({
      typeArguments: pipe(
        node.typeArguments ?? [],
        Effect.forEach(Types.type),
        Effect.map(Chunk.fromIterable),
      ),
      qualifiers: pipe(
        qualifiersOf(node),
        Effect.forEach(Names.required),
        Effect.map(Chunk.fromIterable),
      ),
      target: Names.required(referenceName(node)),
    }).pipe(
      Effect.map((fields) => AST.TypeReference.make({ node, ...fields })),
    );
  }

  if (Syntax.isTypeLiteralNode(node)) {
    return Types.typeMembers(node.members).pipe(
      Effect.map((members) => AST.ObjectType.make({ node, members })),
    );
  }

  if (Syntax.isFunctionTypeNode(node)) {
    return Types.signed(node).pipe(Effect.map(AST.FunctionType.make));
  }

  if (Syntax.isConstructorTypeNode(node)) {
    return Types.signed(node).pipe(Effect.map(AST.ConstructorType.make));
  }

  return expression(node);
};

const typeImpl = (node: TypeSource): Parsed<AST.TypeNode.Interned> =>
  Effect.flatMap(TypeParserState, ({ types }) => {
    const existing = types.get(node);

    if (existing !== undefined) {
      return Effect.succeed(existing);
    }

    return typeNode(node).pipe(
      Effect.flatMap(AST.intern),
      Effect.tap((id) => Effect.sync(() => types.set(node, id))),
    );
  });

/** The parser's methods, each run by `provide` with the services its implementation needs. */
const methods = (
  provide: <A>(effect: Parsed<A>) => Effect.Effect<A, Failure, AST.Store>,
): Types.TypeParser["Service"] => ({
  optional: (node) => provide(optionalImpl(node)),
  typeParameter: (node) => provide(typeParameterImpl(node)),
  parameter: (node) => provide(parameterImpl(node)),
  signature: (node) => provide(signatureImpl(node)),
  call: (node) => provide(callImpl(node)),
  construct: (node) => provide(constructImpl(node)),
  typeMembers: (nodes) => provide(Members.typeMembers(nodes)),
  classMembers: (nodes) => provide(Members.classMembers(nodes)),
  type: (node) => provide(typeImpl(node)),
});

/** One parser serves one parse, so its caches never see a second graph. */
export const layer = Effect.context<
  Comments.CommentParser | TypeScript.Checker.Checker
>().pipe(
  Effect.map((services) => {
    const cache: Cache = {
      types: new WeakMap(),
      parameters: new WeakMap(),
      typeParameters: new WeakMap(),
    };

    const context = Context.add(services, TypeParserState, cache);
    const parser: Types.TypeParser["Service"] = methods((effect) =>
      effect.pipe(
        Effect.provideService(Types.TypeParser, parser),
        Effect.provide(context),
      ),
    );

    return parser;
  }),
  Layer.effect(Types.TypeParser),
);
