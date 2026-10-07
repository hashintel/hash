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

const TypeId: unique symbol = Symbol("@local/harpc-client/codec/Decoder");

export type TypeId = typeof TypeId;

export class DecodingError extends Data.TaggedError("DecodingError")<{
  cause: unknown;
}> {
  get message() {
    return "Failed to encode value";
  }
}

export interface Decoder<E = DecodingError, R = never>
  extends Inspectable.Inspectable, Pipeable.Pipeable {
  readonly [TypeId]: TypeId;

  readonly decode: {
    <SchemaType, SchemaEncoded, SchemaContext>(
      schema: Schema.Codec<SchemaType, SchemaEncoded, SchemaContext, unknown>,
    ): <StreamError, StreamContext>(
      input: Stream.Stream<ArrayBuffer, StreamError, StreamContext>,
    ) => Stream.Stream<
      SchemaType,
      E | StreamError | Schema.SchemaError,
      R | StreamContext | SchemaContext
    >;

    <SchemaType, SchemaEncoded, SchemaContext, StreamError, StreamContext>(
      input: Stream.Stream<ArrayBuffer, StreamError, StreamContext>,
      schema: Schema.Codec<SchemaType, SchemaEncoded, SchemaContext, unknown>,
    ): Stream.Stream<
      SchemaType,
      E | StreamError | Schema.SchemaError,
      R | StreamContext | SchemaContext
    >;
  };
}

interface DecoderImpl<E = DecodingError, R = never> extends Decoder<E, R> {}

const DecoderProto: Omit<DecoderImpl, "decode"> = {
  [TypeId]: TypeId,

  toString() {
    return `Decoder`;
  },

  toJSON() {
    return {
      _id: "Decoder",
    };
  },

  [Inspectable.NodeInspectSymbol](this: DecoderImpl) {
    return this.toJSON();
  },

  pipe() {
    // eslint-disable-next-line prefer-rest-params
    return Pipeable.pipeArguments(this, arguments);
  },
};

// eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- description is defined
export const Decoder = Context.Service<Decoder>(TypeId.description!);

export const make = <E = DecodingError, R = never>(
  decode: <
    SchemaType,
    SchemaEncoded,
    SchemaContext,
    StreamError,
    StreamContext,
  >(
    input: Stream.Stream<ArrayBuffer, StreamError, StreamContext>,
    schema: Schema.Codec<SchemaType, SchemaEncoded, SchemaContext, unknown>,
  ) => Stream.Stream<
    SchemaType,
    E | StreamError | Schema.SchemaError,
    R | StreamContext | SchemaContext
  >,
) =>
  createProto(DecoderProto, {
    decode: Function.dual(2, decode),
  }) satisfies DecoderImpl<E, R> as Decoder<E, R>;
