import { Brand, Either, HashSet, Option, ReadonlyRecord } from "effect";
import { AST } from "@effect/schema";
import { EncodeError } from "../DataType/error.js";
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

export interface EncodeContext<T> {
  readonly root: T;
  readonly visited: HashSet.HashSet<NodeHash>;

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

    path: [],
    jsonSchema: { additional: {} },
  };
}

export function visit<T>(
  ast: AST.AST,
  context: EncodeContext<T>,
): Either.Either<EncodeContext<T>, EncodeError> {
  if (hasHash(context, ast)) {
    return Either.left(EncodeError.cyclicSchema());
  }

  return Either.right({
    root: context.root,
    visited: HashSet.add(context.visited, hashNode(ast)),
    path: context.path,
    jsonSchema: updateJsonSchema(context.jsonSchema, ast),
  });
}
