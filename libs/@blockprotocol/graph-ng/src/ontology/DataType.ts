import * as S from "@effect/schema/Schema";
import {
  Effect,
  Option,
  Equal,
  Hash,
  Inspectable,
  pipe,
  Pipeable,
  Predicate,
} from "effect";
import { globalValue } from "effect/GlobalValue";

import * as Json from "../Json.js";
import { decodeSchema } from "./DataType/decode.js";
import { encodeSchema } from "./DataType/encode.js";
import { DecodeError, EncodeError, InternalError } from "./DataType/error.js";
import { DataTypeSchema } from "./DataType/schema.js";
import * as DataTypeUrl from "./DataTypeUrl.js";
import { AST } from "@effect/schema";

const TypeId: unique symbol = Symbol.for(
  "@blockprotocol/graph/ontology/DataType",
);
export type TypeId = typeof TypeId;

/** @internal */
export const AnnotationId: unique symbol = Symbol.for(
  "@blockprotocol/graph/ontology/DataType/Annotation",
);

export interface DataType<Out, In extends Json.Value = Json.Value>
  extends Equal.Equal,
    Pipeable.Pipeable,
    Inspectable.Inspectable {
  [TypeId]: TypeId;

  readonly id: DataTypeUrl.DataTypeUrl;
  readonly schema: S.Schema<Out, In>;
}

// TODO: cache possibility?!
interface DataTypeImpl<Out, In extends Json.Value = Json.Value>
  extends DataType<Out, In> {}

const DataTypeProto: Omit<DataTypeImpl<unknown>, "id" | "schema"> = {
  [TypeId]: TypeId,

  toJSON(this: DataTypeImpl<unknown>): unknown {
    return {
      _id: "DataType",
      id: this.id,
      schema: this.schema.ast.toJSON(),
    };
  },
  toString(this: DataTypeImpl<unknown>): string {
    return Inspectable.format(this.toJSON());
  },
  [Inspectable.NodeInspectSymbol]() {
    return this.toJSON();
  },

  pipe() {
    // eslint-disable-next-line prefer-rest-params
    Pipeable.pipeArguments(this, arguments);
  },

  [Hash.symbol](this: DataTypeImpl<unknown>) {
    return pipe(
      Hash.hash(TypeId),
      Hash.combine(Hash.hash(this.id)),
      Hash.cached(this),
    );
  },
  [Equal.symbol]<T, E>(this: DataType<T, E>, that: unknown): boolean {
    // eslint-disable-next-line @typescript-eslint/no-use-before-define
    if (!isDataType(that)) {
      return false;
    }

    return this.id === that.id;
  },
};

const schemaStorage = globalValue(
  Symbol.for("@blockprotocol/graph/ontology/DataType/schemaStorage"),
  () => new Map<DataType<unknown>, DataTypeSchema>(),
);

export function isDataType(value: unknown): value is DataType<unknown> {
  return Predicate.hasProperty(value, TypeId);
}

function makeImpl<Out, In extends Json.Value>(
  id: DataTypeUrl.DataTypeUrl,
  schema: S.Schema<Out, In>,
): DataTypeImpl<Out, In> {
  // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
  const impl = Object.create(DataTypeProto);
  // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
  impl.id = id;

  // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
  impl.schema = schema.annotations({
    [AnnotationId]: () => impl as DataType<unknown>,
  });

  return impl as DataTypeImpl<Out, In>;
}

function toSchemaImpl<Out, In>(
  schema: S.Schema<Out, In>,
): Effect.Effect<DataTypeSchema, EncodeError> {
  return encodeSchema(schema.ast);
}

export function make<Out, In extends Json.Value>(
  id: DataTypeUrl.DataTypeUrl,
  schema: S.Schema<Out, In>,
): Effect.Effect<DataType<Out, In>, EncodeError> {
  return Effect.gen(function* (_) {
    const impl = makeImpl(id, schema);
    const compiled = yield* _(toSchemaImpl(impl.schema));
    schemaStorage.set(impl as unknown as DataType<unknown>, compiled);
    return impl;
  });
}

export function makeOrThrow<Out, In extends Json.Value>(
  id: DataTypeUrl.DataTypeUrl,
  schema: S.Schema<Out, In>,
): DataType<Out, In> {
  return Effect.runSync(make(id, schema));
}

export function parse<I extends string, Out, In extends Json.Value>(
  id: I,
  schema: S.Schema<Out, In>,
): Effect.Effect<DataType<Out, In>, EncodeError> {
  return pipe(
    DataTypeUrl.parse(id),
    Effect.mapError((error) => EncodeError.invalidUrl(error)),
    Effect.andThen((url) => make(url, schema)),
  );
}

export function parseOrThrow<I extends string, Out, In extends Json.Value>(
  id: I,
  schema: S.Schema<Out, In>,
): DataType<Out, In> {
  return Effect.runSync(parse(id, schema));
}

export function toSchema<Out, In extends Json.Value>(
  dataType: DataType<Out, In>,
): Effect.Effect<DataTypeSchema, EncodeError> {
  const unknownDataType = dataType as unknown as DataType<unknown>;
  if (schemaStorage.has(unknownDataType)) {
    return Effect.succeed(schemaStorage.get(unknownDataType)!);
  }

  return toSchemaImpl(dataType.schema);
}

export function fromSchema(
  schema: DataTypeSchema,
): Effect.Effect<DataType<Json.Value>, DecodeError> {
  return Effect.gen(function* (_) {
    const inner = decodeSchema(schema);

    const dataType = yield* _(
      make(schema.$id, inner),
      Effect.mapError((cause) => DecodeError.encode(cause)),
    );

    return dataType;
  });
}

/** @internal */
export const tryFromAST = (
  ast: AST.AST,
): Effect.Effect<DataType<unknown>, InternalError> =>
  Effect.gen(function* (_) {
    const annotation = AST.getAnnotation(ast, AnnotationId);
    if (Option.isNone(annotation)) {
      return yield* _(InternalError.annotation("missing"));
    }

    if (!Predicate.isFunction(annotation.value)) {
      return yield* _(InternalError.annotation("expected function"));
    }

    const dataType = annotation.value();
    if (!isDataType(dataType)) {
      return yield* _(
        InternalError.annotation("expected function to return `DataType`"),
      );
    }

    return dataType;
  });

/** @internal */
export const getFromAST = (
  ast: AST.AST,
): Effect.Effect<Option.Option<DataType<unknown>>> =>
  pipe(tryFromAST(ast), Effect.option);

export type { DataTypeSchema as Schema };
