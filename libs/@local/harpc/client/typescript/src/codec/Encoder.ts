import {
  Context,
  Data,
  Function,
  Inspectable,
  Pipeable,
  type Schema,
  type Stream,
} from "effect";

import { createProto } from "../utils.js";

const TypeId: unique symbol = Symbol("@local/harpc-client/codec/Encoder");

export type TypeId = typeof TypeId;

export class EncodingError extends Data.TaggedError("EncodingError")<{
  cause: unknown;
}> {
  get message() {
    return "Failed to encode value";
  }
}

export interface Encoder<E = EncodingError, R = never>
  extends Inspectable.Inspectable, Pipeable.Pipeable {
  readonly [TypeId]: TypeId;

  readonly encode: {
    <SchemaType, SchemaEncoded, SchemaContext>(
      schema: Schema.Codec<SchemaType, SchemaEncoded, unknown, SchemaContext>,
    ): <StreamError, StreamContext>(
      input: Stream.Stream<SchemaType, StreamError, StreamContext>,
    ) => Stream.Stream<
      ArrayBuffer,
      E | StreamError | Schema.SchemaError,
      R | StreamContext | SchemaContext
    >;

    <SchemaType, SchemaEncoded, SchemaContext, StreamError, StreamContext>(
      input: Stream.Stream<SchemaType, StreamError, StreamContext>,
      schema: Schema.Codec<SchemaType, SchemaEncoded, unknown, SchemaContext>,
    ): Stream.Stream<
      ArrayBuffer,
      E | StreamError | Schema.SchemaError,
      R | StreamContext | SchemaContext
    >;
  };
}

interface EncoderImpl<E = EncodingError, R = never> extends Encoder<E, R> {}

const EncoderProto: Omit<EncoderImpl, "encode"> = {
  [TypeId]: TypeId,

  toString() {
    return `Encoder`;
  },

  toJSON() {
    return {
      _id: "Encoder",
    };
  },

  [Inspectable.NodeInspectSymbol]() {
    return this.toJSON();
  },

  pipe() {
    // eslint-disable-next-line prefer-rest-params
    return Pipeable.pipeArguments(this, arguments);
  },
};

// eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- description is defined
export const Encoder = Context.Service<Encoder>(TypeId.description!);

export const make = <E = EncodingError, R = never>(
  encode: <
    SchemaType,
    SchemaEncoded,
    SchemaContext,
    StreamError,
    StreamContext,
  >(
    input: Stream.Stream<SchemaType, StreamError, StreamContext>,
    schema: Schema.Codec<SchemaType, SchemaEncoded, unknown, SchemaContext>,
  ) => Stream.Stream<
    ArrayBuffer,
    E | StreamError | Schema.SchemaError,
    R | StreamContext | SchemaContext
  >,
) =>
  createProto(EncoderProto, {
    encode: Function.dual(2, encode),
  }) satisfies EncoderImpl<E, R> as Encoder<E, R>;
