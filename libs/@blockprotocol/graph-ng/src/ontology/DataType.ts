import * as S from "@effect/schema/Schema";
import {
  Either,
  Equal,
  Hash,
  Inspectable,
  pipe,
  Pipeable,
  Predicate,
} from "effect";

import * as Json from "../Json.js";
import { decodeSchema } from "./DataType/decode.js";
import { encodeSchema } from "./DataType/encode.js";
import { DecodeError, EncodeError } from "./DataType/error.js";
import { DataTypeSchema } from "./DataType/schema.js";
import * as DataTypeUrl from "./DataTypeUrl.js";

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
): Either.Either<DataTypeSchema, EncodeError> {
  return encodeSchema(schema.ast);
}

export function make<Out, In extends Json.Value>(
  id: DataTypeUrl.DataTypeUrl,
  schema: S.Schema<Out, In>,
): Either.Either<DataType<Out, In>, EncodeError> {
  const impl = makeImpl(id, schema);

  return pipe(
    toSchemaImpl(impl.schema),
    Either.map(() => impl),
  );
}

export function makeOrThrow<Out, In extends Json.Value>(
  id: DataTypeUrl.DataTypeUrl,
  schema: S.Schema<Out, In>,
): DataType<Out, In> {
  return Either.getOrThrow(make(id, schema));
}

export function parse<I extends string, Out, In extends Json.Value>(
  id: I,
  schema: S.Schema<Out, In>,
): Either.Either<DataType<Out, In>, EncodeError> {
  return pipe(
    DataTypeUrl.parse(id),
    Either.mapLeft((error) => EncodeError.invalidUrl(error)),
    Either.andThen((url) => make(url, schema)),
  );
}

export function parseOrThrow<I extends string, Out, In extends Json.Value>(
  id: I,
  schema: S.Schema<Out, In>,
): DataType<Out, In> {
  return Either.getOrThrow(parse(id, schema));
}

export function toSchema<Out, In extends Json.Value>(
  dataType: DataType<Out, In>,
): DataTypeSchema {
  const schema = toSchemaImpl(dataType.schema);

  // the value has been validated in `make<T>`
  return Either.getOrThrow(schema);
}

export function fromSchema(
  schema: DataTypeSchema,
): Either.Either<DataType<Json.Value>, DecodeError> {
  return Either.gen(function* (_) {
    const inner = decodeSchema(schema);

    const dataType = yield* _(
      make(schema.$id, inner),
      Either.mapLeft((cause) => DecodeError.encode(cause)),
    );

    return dataType;
  });
}

export type { DataTypeSchema as Schema };
