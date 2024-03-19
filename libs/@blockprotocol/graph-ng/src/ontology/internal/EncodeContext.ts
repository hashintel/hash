import { AST } from "@effect/schema";
import {
  Brand,
  Data,
  Effect,
  HashSet,
  Option,
  Predicate,
  ReadonlyRecord,
} from "effect";
import { globalValue } from "effect/GlobalValue";

type PathComponent =
  | {
      _tag: "Entry";
      key: string;
    }
  | {
      _tag: "Index";
      index: number;
    };

export interface BaseProperties {
  title?: string;
  description?: string;
}

interface JsonSchema {
  readonly title?: string;
  readonly description?: string;

  readonly additional: Record<string, unknown>;
}

function getJsonSchema(ast: AST.Annotated): JsonSchema {
  const record = ReadonlyRecord.getSomes({
    title: AST.getTitleAnnotation(ast),
    description: AST.getDescriptionAnnotation(ast),
  });

  const additional = AST.getJSONSchemaAnnotation(ast) as Option.Option<
    Record<string, unknown>
  >;

  return { ...record, additional: Option.getOrElse(additional, () => ({})) };
}

function updateJsonSchema(current: JsonSchema, ast: AST.Annotated): JsonSchema {
  const update = getJsonSchema(ast);

  return {
    ...current,
    ...update,
    additional: { ...current.additional, ...update.additional },
  };
}

type NodeHash = Brand.Branded<number, "NodeHash">;
const NodeHash = Brand.nominal<NodeHash>();

export interface State {
  readonly suspenseDepth: number;
}

export interface EncodeContext<T> {
  readonly root: T;
  readonly visited: HashSet.HashSet<NodeHash>;
  readonly state: State;

  readonly path: ReadonlyArray<PathComponent>;

  readonly jsonSchema: JsonSchema;
}

const hashCollection = globalValue(
  Symbol.for(
    "@blockprotoco/graph/ontology/internal/EncodeContext/hashCollection",
  ),
  () => new WeakMap<AST.AST, NodeHash>(),
);

function hashNode(node: AST.AST): NodeHash {
  const existing = hashCollection.get(node);
  if (existing !== undefined) {
    return existing;
  }

  const hash = NodeHash(AST.hash(node));
  hashCollection.set(node, hash);

  return hash;
}

function hasHash<T>(context: EncodeContext<T>, node: AST.AST) {
  return HashSet.has(context.visited, hashNode(node));
}

export function make<T>(root: T): EncodeContext<T> {
  return {
    root,
    visited: HashSet.empty(),
    state: { suspenseDepth: 0 },

    path: [],
    jsonSchema: { additional: {} },
  };
}

type VisitErrorReason = Data.TaggedEnum<{
  CyclicSchema: {};
}>;
const VisitErrorReason = Data.taggedEnum<VisitErrorReason>();

export class VisitError extends Data.TaggedError("VisitError")<{
  reason: VisitErrorReason;
}> {
  static cyclicSchema(): VisitError {
    return new VisitError({
      reason: VisitErrorReason.CyclicSchema(),
    });
  }
}

type SuspendedAST = () => AST.AST;
export type VisitAST = AST.AST | SuspendedAST;

interface VisitOk<T> {
  node: AST.AST;
  context: EncodeContext<T>;
  // context that hasn't updated the jsonSchema
  staleContext: EncodeContext<T>;
}

function visitEager<T>(ast: AST.AST, context: EncodeContext<T>): VisitOk<T> {
  const childContext = {
    root: context.root,
    visited: context.visited,
    state: context.state,
    path: context.path,
    jsonSchema: updateJsonSchema(context.jsonSchema, ast),
  };

  return { node: ast, context: childContext, staleContext: context };
}

function visitSuspended<T>(
  fn: SuspendedAST,
  context: EncodeContext<T>,
): Effect.Effect<VisitOk<T>, VisitError> {
  const ast = fn();

  if (hasHash(context, ast)) {
    return Effect.fail(VisitError.cyclicSchema());
  }

  const childContext = {
    root: context.root,
    visited: HashSet.add(context.visited, hashNode(ast)),
    state: { suspenseDepth: context.state.suspenseDepth + 1 },
    path: context.path,
    jsonSchema: updateJsonSchema(context.jsonSchema, fn()),
  };

  return Effect.succeed({
    node: ast,
    context: childContext,
    staleContext: { ...childContext, jsonSchema: context.jsonSchema },
  });
}

export function visit<T>(
  ast: VisitAST,
  context: EncodeContext<T>,
): Effect.Effect<VisitOk<T>, VisitError> {
  // we only need to check for cycles in lazy ASTs, this is because otherwise the AST is simply a DAG.
  if (Predicate.isFunction(ast)) {
    return visitSuspended(ast, context);
  }

  return Effect.succeed(visitEager(ast, context));
}
