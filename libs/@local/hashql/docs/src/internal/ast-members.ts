import { Array, Chunk, Effect, MutableHashMap, Option, pipe } from "effect";
import * as Syntax from "typescript/ast";

import * as AST from "../AST/index.js";
import * as TypeScript from "../TypeScript/index.js";
import * as Comments from "./ast-comments.js";
import * as Types from "./ast-type-parser.js";
import * as Source from "./ast/source.js";

import type { Interned } from "../AST/Interned.js";
import type { Failure } from "./ast-type-parser.js";
import type { Symbol as CompilerSymbol } from "typescript/async";

export type Requirements =
  | AST.Store
  | Types.TypeParser
  | Comments.CommentParser
  | TypeScript.Checker.Checker;

type Parsed<A> = Effect.Effect<A, Failure, Requirements>;

type CommonSource =
  | Syntax.PropertyDeclaration
  | Syntax.PropertySignatureDeclaration
  | Syntax.MethodDeclaration
  | Syntax.MethodSignatureDeclaration
  | Syntax.GetAccessorDeclaration
  | Syntax.SetAccessorDeclaration
  | Syntax.IndexSignatureDeclaration;

type CommonMember =
  | AST.Property.Property
  | AST.Method.Method
  | AST.Accessor.Accessor
  | AST.IndexSignature.IndexSignature;

const isCommon = (node: Syntax.Node): node is CommonSource =>
  Syntax.isPropertyDeclaration(node) ||
  Syntax.isPropertySignatureDeclaration(node) ||
  Syntax.isMethodDeclaration(node) ||
  Syntax.isMethodSignatureDeclaration(node) ||
  Syntax.isGetAccessorDeclaration(node) ||
  Syntax.isSetAccessorDeclaration(node) ||
  Syntax.isIndexSignatureDeclaration(node);

const isMethod = (
  node: CommonSource,
): node is Syntax.MethodDeclaration | Syntax.MethodSignatureDeclaration =>
  Syntax.isMethodDeclaration(node) || Syntax.isMethodSignatureDeclaration(node);

const unsupported = (node: Syntax.Node): Parsed<never> =>
  Effect.fail(
    AST.ParseError.unsupportedDeclaration({
      name: node.getText(),
      kinds: [Syntax.SyntaxKind[node.kind]],
    }),
  );

/** The name and the static modifier a member's declarations share, read from its first. */
interface Named {
  readonly name: string;
  readonly static: boolean;
}

const namedOf = (
  node:
    | Syntax.PropertyDeclaration
    | Syntax.PropertySignatureDeclaration
    | Syntax.MethodDeclaration
    | Syntax.MethodSignatureDeclaration
    | Syntax.GetAccessorDeclaration
    | Syntax.SetAccessorDeclaration,
): Named => ({
  name: Source.nameOf(node.name),
  static: TypeScript.Node.hasModifier(node, Syntax.ModifierFlags.Static),
});

const methodOf = (
  methods: Array.NonEmptyReadonlyArray<
    Syntax.MethodDeclaration | Syntax.MethodSignatureDeclaration
  >,
): Parsed<AST.Method.Method> =>
  Effect.forEach(methods, Types.call).pipe(
    Effect.map((overloads) =>
      AST.Method.make({
        overloads: Chunk.make(...overloads),
        ...namedOf(methods[0]),
      }),
    ),
  );

type AccessorSource =
  | Syntax.GetAccessorDeclaration
  | Syntax.SetAccessorDeclaration;

const isAccessor = (node: CommonSource): node is AccessorSource =>
  Syntax.isGetAccessorDeclaration(node) ||
  Syntax.isSetAccessorDeclaration(node);

/** A getter and a setter of one name form one member, either half of which may be absent. */
const accessorOf = (
  accessors: Array.NonEmptyReadonlyArray<AccessorSource>,
): Parsed<AST.Accessor.Accessor> => {
  const getters = Array.filter(accessors, Syntax.isGetAccessorDeclaration);
  const setters = Array.filter(accessors, Syntax.isSetAccessorDeclaration);

  return Effect.all({
    get: Effect.transposeOption(
      Option.map(Array.head(getters), (getter) =>
        Types.signed(getter).pipe(
          Effect.map(AST.Getter.make),
          Effect.flatMap(AST.intern),
        ),
      ),
    ),
    set: Effect.transposeOption(
      Option.map(Array.head(setters), (setter) =>
        Types.signed(setter).pipe(
          Effect.map(AST.Setter.make),
          Effect.flatMap(AST.intern),
        ),
      ),
    ),
  }).pipe(
    Effect.map((halves) =>
      AST.Accessor.make({ ...halves, ...namedOf(accessors[0]) }),
    ),
  );
};

const propertyOf = (
  node: Syntax.PropertyDeclaration | Syntax.PropertySignatureDeclaration,
): Parsed<AST.Property.Property> =>
  Effect.all({
    node: Effect.succeed(node),
    type: Types.optional(Option.fromUndefinedOr(node.type)),
    documentation: Comments.documentation(node),
  }).pipe(
    Effect.map((fields) => AST.Property.make({ ...fields, ...namedOf(node) })),
  );

/** One member from the declarations that share its symbol. Overloaded methods and paired accessors merge, anything else must stand alone. */
const commonMember = (
  nodes: Array.NonEmptyReadonlyArray<CommonSource>,
): Parsed<CommonMember> => {
  const [node] = nodes;
  const methods = Array.filter(nodes, isMethod);

  if (Array.isArrayNonEmpty(methods) && methods.length === nodes.length) {
    return methodOf(methods);
  }

  const accessors = Array.filter(nodes, isAccessor);

  if (
    Array.isArrayNonEmpty(accessors) &&
    accessors.length === nodes.length &&
    Array.filter(accessors, Syntax.isGetAccessorDeclaration).length <= 1 &&
    Array.filter(accessors, Syntax.isSetAccessorDeclaration).length <= 1
  ) {
    return accessorOf(accessors);
  }

  if (nodes.length !== 1) {
    return Effect.fail(
      AST.ParseError.unsupportedMerge({
        name: node.getText(),
        kinds: Array.map(nodes, (member) => Syntax.SyntaxKind[member.kind]),
      }),
    );
  }

  if (Syntax.isIndexSignatureDeclaration(node)) {
    return Types.signed(node).pipe(Effect.map(AST.IndexSignature.make));
  }

  if (
    Syntax.isPropertyDeclaration(node) ||
    Syntax.isPropertySignatureDeclaration(node)
  ) {
    return propertyOf(node);
  }

  return unsupported(node);
};

/** The symbol a declaration's member shares with the member's other declarations. An index signature has no named symbol. */
const symbolOf = (
  node: CommonSource,
): Parsed<Option.Option<CompilerSymbol>> => {
  if (Syntax.isIndexSignatureDeclaration(node)) {
    return Effect.succeedNone;
  }

  return Effect.asSome(TypeScript.Checker.getSymbolOfDeclaration(node));
};

/** Declarations sharing a symbol, which is the member's own. */
interface Group {
  readonly nodes: Array.NonEmptyArray<CommonSource>;
  readonly symbol: Option.Option<CompilerSymbol>;
}

/** Declarations of one member share their symbol, and each index signature stays a member of its own. Members keep the order of their first declarations. */
const groupsOf = (
  keyed: readonly {
    readonly node: CommonSource;
    readonly symbol: Option.Option<CompilerSymbol>;
  }[],
): readonly Group[] => {
  const groups: Group[] = [];
  const bySymbol = MutableHashMap.empty<number, Group>();

  for (const { node, symbol } of keyed) {
    const group = Option.flatMap(symbol, ({ id }) =>
      MutableHashMap.get(bySymbol, id),
    );

    if (Option.isSome(group)) {
      group.value.nodes.push(node);
    } else {
      const created: Group = { nodes: [node], symbol };
      groups.push(created);

      if (Option.isSome(symbol)) {
        MutableHashMap.set(bySymbol, symbol.value.id, created);
      }
    }
  }

  return groups;
};

/** A member named by its symbol, reserved before parsing so references inside it can resolve to it. */
const groupedMember = ({
  nodes,
  symbol,
}: Group): Parsed<Interned<CommonMember>> =>
  Option.match(symbol, {
    onNone: () => AST.reserve(() => commonMember(nodes)),
    onSome: (named) => AST.reserveSymbol([named], () => commonMember(nodes)),
  });

const commonMembers = (
  nodes: readonly CommonSource[],
): Parsed<readonly Interned<CommonMember>[]> =>
  pipe(
    Effect.forEach(nodes, (node) =>
      symbolOf(node).pipe(Effect.map((symbol) => ({ node, symbol }))),
    ),
    Effect.map(groupsOf),
    Effect.flatMap(Effect.forEach(groupedMember)),
  );

const signatureMember = (
  node: Syntax.TypeElement,
): Parsed<AST.CallSignature.Interned | AST.ConstructSignature.Interned> => {
  if (Syntax.isCallSignatureDeclaration(node)) {
    return Types.call(node);
  }

  if (Syntax.isConstructSignatureDeclaration(node)) {
    return Types.construct(node);
  }

  return unsupported(node);
};

/** The members of an interface or type literal: named members first, then call and construct signatures. */
export const typeMembers = (
  nodes: readonly Syntax.TypeElement[],
): Parsed<Chunk.Chunk<AST.Member.InternedType>> =>
  Effect.all({
    common: commonMembers(Array.filter(nodes, isCommon)),
    signatures: Effect.forEach(
      Array.filter(nodes, (node) => !isCommon(node)),
      signatureMember,
    ),
  }).pipe(
    Effect.map(({ common, signatures }) =>
      Chunk.fromIterable(Array.appendAll(common, signatures)),
    ),
  );

const constructorOf = (
  constructors: Array.NonEmptyReadonlyArray<Syntax.ConstructorDeclaration>,
): Parsed<AST.Constructor.Interned> =>
  pipe(
    Effect.forEach(constructors, Types.construct),
    Effect.map((overloads) =>
      AST.Constructor.make({ overloads: Chunk.make(...overloads) }),
    ),
    Effect.flatMap(AST.intern),
  );

const isClassMember = (node: Syntax.ClassElement): boolean =>
  isCommon(node) ||
  Syntax.isConstructorDeclaration(node) ||
  Syntax.isSemicolonClassElement(node);

/** The members of a class: named members first, then its constructors as one member. Any other class element fails the class. */
export const classMembers = (
  nodes: readonly Syntax.ClassElement[],
): Parsed<Chunk.Chunk<AST.Member.InternedClass>> =>
  Effect.all({
    common: commonMembers(Array.filter(nodes, isCommon)),
    constructors: Array.match(
      Array.filter(nodes, Syntax.isConstructorDeclaration),
      {
        onEmpty: () => Effect.succeedNone,
        onNonEmpty: (constructors) =>
          constructorOf(constructors).pipe(Effect.asSome),
      },
    ),
  }).pipe(
    Effect.tap(() =>
      pipe(
        Array.findFirst(nodes, (node) => !isClassMember(node)),
        Option.map(unsupported),
        Effect.transposeOption,
      ),
    ),
    Effect.map(({ common, constructors }) =>
      Chunk.fromIterable(
        Array.appendAll<AST.Member.InternedClass, AST.Member.InternedClass>(
          common,
          Option.toArray(constructors),
        ),
      ),
    ),
  );
