/**
 * The names TypeScript code refers to, each at the identifier that writes it.
 *
 * A reference is a chain of identifiers in a type reference, a `typeof` query or a heritage clause, whose first name no type parameter, parameter, `infer` or mapped-type key of the code binds. Formatting the code moves the references without changing their order, which is how a code block pairs them with links the transform chose before the formatter ran.
 *
 * @module
 */
import {
  Array,
  Filter,
  Match,
  Option,
  Order,
  Predicate,
  Struct,
  pipe,
} from "effect";
import { Visitor } from "oxc-parser";

import type {
  BindingPattern,
  BindingProperty,
  BindingRestElement,
  Expression,
  IdentifierName,
  ParamPattern,
  Program,
  Span,
  TSConditionalType,
  TSInferType,
  TSTypeName,
  TSTypeParameterDeclaration,
} from "oxc-parser";

/** A name the statements refer to, at one of its identifiers. */
export interface Reference {
  readonly start: number;
  readonly end: number;
  /** The names up to and including this identifier, outermost first: `Type`, then `Type.Any`. */
  readonly path: Array.NonEmptyReadonlyArray<string>;
}

/** A name in an entity name or a member expression, at its identifier. */
interface Segment {
  readonly name: string;
  readonly start: number;
  readonly end: number;
}

const segment = ({ name, start, end }: IdentifierName): Segment => ({
  name,
  start,
  end,
});

// `this.x` names no declaration, so a qualifier that bottoms out at `this` yields nothing.
const typeNameSegments = (name: TSTypeName): readonly Segment[] => {
  if (name.type === "Identifier") {
    return [segment(name)];
  }

  if (name.type === "TSQualifiedName") {
    return Array.match(typeNameSegments(name.left), {
      onEmpty: () => [],
      onNonEmpty: Array.append(segment(name.right)),
    });
  }

  return [];
};

// Heritage clauses and `extends` name their base as an expression, which refers to a declaration only as a chain of identifiers.
const expressionSegments = (expression: Expression): readonly Segment[] => {
  if (expression.type === "Identifier") {
    return [segment(expression)];
  }

  if (
    expression.type === "MemberExpression" &&
    !expression.computed &&
    expression.property.type === "Identifier"
  ) {
    const { property } = expression;

    return Array.match(expressionSegments(expression.object), {
      onEmpty: () => [],
      onNonEmpty: Array.append(segment(property)),
    });
  }

  return [];
};

const patternNames: (
  pattern: BindingPattern | ParamPattern,
) => readonly string[] = Match.type<BindingPattern | ParamPattern>().pipe(
  Match.discriminatorsExhaustive("type")({
    Identifier: ({ name }) => [name],
    AssignmentPattern: ({ left }) => patternNames(left),
    RestElement: ({ argument }) => patternNames(argument),
    TSParameterProperty: ({ parameter }) => patternNames(parameter),
    ObjectPattern: ({ properties }) =>
      Array.flatMap(
        properties,
        Match.type<BindingProperty | BindingRestElement>().pipe(
          Match.discriminatorsExhaustive("type")({
            Property: ({ value }) => patternNames(value),
            RestElement: ({ argument }) => patternNames(argument),
          }),
        ),
      ),
    ArrayPattern: ({ elements }) =>
      pipe(
        elements,
        Array.filter(Predicate.isNotNull),
        Array.flatMap((element) => patternNames(element)),
      ),
  }),
);

/** Names a declaration binds over a range of the code: type parameters, `infer` and mapped-type keys as types, parameters as values. */
interface Binder {
  readonly start: number;
  readonly end: number;
  readonly types: readonly string[];
  readonly values: readonly string[];
}

/** A chain of identifiers that refers to a declaration, and the space TypeScript looks its first name up in. */
interface Candidate {
  readonly segments: Array.NonEmptyReadonlyArray<Segment>;
  readonly space: "types" | "values";
}

/** Where the syntax binds names, and the chains of identifiers that may refer to declarations. */
interface Collected {
  readonly binders: readonly Binder[];
  readonly candidates: readonly Candidate[];
  readonly conditionals: readonly TSConditionalType[];
  readonly infers: readonly TSInferType[];
}

const typeParameterNames = (
  declaration: TSTypeParameterDeclaration | null | undefined,
): readonly string[] =>
  Array.map(declaration?.params ?? [], ({ name }) => name.name);

const collect = (program: Program): Collected => {
  const binders: Binder[] = [];
  const candidates: Candidate[] = [];
  const conditionals: TSConditionalType[] = [];
  const infers: TSInferType[] = [];

  const binds = (node: {
    readonly start: number;
    readonly end: number;
    readonly typeParameters?: TSTypeParameterDeclaration | null;
    readonly params?: readonly ParamPattern[];
  }): void => {
    binders.push({
      start: node.start,
      end: node.end,
      types: typeParameterNames(node.typeParameters),
      values: Array.flatMap(node.params ?? [], patternNames),
    });
  };
  const refers = (
    segments: readonly Segment[],
    space: Candidate["space"],
  ): void => {
    if (Array.isReadonlyArrayNonEmpty(segments)) {
      candidates.push({ segments, space });
    }
  };

  new Visitor({
    TSTypeAliasDeclaration: binds,
    TSInterfaceDeclaration: binds,
    ClassDeclaration: (node): void => {
      binds(node);

      if (node.superClass !== null) {
        refers(expressionSegments(node.superClass), "values");
      }
    },
    FunctionDeclaration: binds,
    FunctionExpression: binds,
    TSDeclareFunction: binds,
    ArrowFunctionExpression: binds,
    TSFunctionType: binds,
    TSConstructorType: binds,
    TSMethodSignature: binds,
    TSCallSignatureDeclaration: binds,
    TSConstructSignatureDeclaration: binds,
    // The key binds in the name and value types, which follow the constraint.
    TSMappedType: ({ key, constraint, end }): void => {
      binders.push({
        start: constraint.end,
        end,
        types: [key.name],
        values: [],
      });
    },
    TSConditionalType: (node): void => {
      conditionals.push(node);
    },
    TSInferType: (node): void => {
      infers.push(node);
    },
    TSTypeReference: ({ typeName }): void => {
      refers(typeNameSegments(typeName), "types");
    },
    TSTypeQuery: ({ exprName }): void => {
      if (exprName.type !== "TSImportType") {
        refers(typeNameSegments(exprName), "values");
      }
    },
    TSInterfaceHeritage: ({ expression }): void => {
      refers(expressionSegments(expression), "types");
    },
    TSClassImplements: ({ expression }): void => {
      refers(expressionSegments(expression), "types");
    },
  }).visit(program);

  return { binders, candidates, conditionals, infers };
};

const contains = (outer: Span, inner: Span): boolean =>
  outer.start <= inner.start && inner.end <= outer.end;

// An `infer` belongs to the innermost conditional whose `extends` clause holds it, and binds over that clause and the true branch.
const inferBinders = ({ conditionals, infers }: Collected): readonly Binder[] =>
  Array.filterMap(
    infers,
    Filter.fromPredicateOption((infer) =>
      pipe(
        conditionals,
        Array.filter(({ extendsType }) => contains(extendsType, infer)),
        Array.sortWith(
          ({ extendsType }) => extendsType.end - extendsType.start,
          Order.Number,
        ),
        Array.head,
        Option.map(
          ({ extendsType, trueType }): Binder => ({
            start: extendsType.start,
            end: trueType.end,
            types: [infer.typeParameter.name.name],
            values: [],
          }),
        ),
      ),
    ),
  );

// Every identifier of a chain is a reference: `Type.Any` refers to `Type` at its first identifier and to `Type.Any` at its second.
const referencesAlong = (
  segments: Array.NonEmptyReadonlyArray<Segment>,
): readonly Reference[] =>
  Array.map(
    segments,
    ({ start, end }, index): Reference => ({
      start,
      end,
      path: [
        Array.headNonEmpty(segments).name,
        ...Array.map(segments.slice(1, index + 1), Struct.get("name")),
      ],
    }),
  );

/** The names a program refers to, in source order. A name bound by a type parameter, a parameter or `infer` is not a declaration a page documents, so it yields no reference. */
export const of = (program: Program): readonly Reference[] => {
  const collected = collect(program);
  const binders = [...collected.binders, ...inferBinders(collected)];
  const isBound = ({ segments: [head], space }: Candidate): boolean =>
    Array.some(
      binders,
      (binder) => contains(binder, head) && binder[space].includes(head.name),
    );

  return pipe(
    collected.candidates,
    Array.filter((candidate) => !isBound(candidate)),
    Array.flatMap(({ segments }) => referencesAlong(segments)),
  );
};
