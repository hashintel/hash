import {
  Console,
  Effect,
  Exit,
  Function,
  Inspectable,
  Mailbox,
  Option,
  pipe,
  Pipeable,
  Predicate,
  Ref,
} from "effect";

import { createProto } from "../../utils.js";
import * as Buffer from "../Buffer.js";
import type { Payload, Protocol, ProtocolVersion } from "../models/index.js";
import { Response, ResponseFlags } from "../models/response/index.js";

const TypeId: unique symbol = Symbol(
  "@local/harpc-client/wire-protocol/codec/ResponseDecoder",
);
export type TypeId = typeof TypeId;

type ResponseDecodeError =
  | Buffer.UnexpectedEndOfBufferError
  | ProtocolVersion.InvalidProtocolVersionError
  | Protocol.InvalidMagicError
  | Payload.PayloadTooLargeError;

interface Cursor {
  buffer: ArrayBuffer;
  index: number;
}

export interface ResponseDecoder
  extends Inspectable.Inspectable,
    Pipeable.Pipeable {
  readonly [TypeId]: typeof TypeId;
}

interface ResponseDecoderImpl extends ResponseDecoder {
  readonly buffer: Ref.Ref<Cursor>;
  readonly output: Mailbox.Mailbox<Response.Response, ResponseDecodeError>;
}

const ResponseDecoderProto: Omit<ResponseDecoderImpl, "buffer" | "output"> = {
  [TypeId]: TypeId,

  toString(this: ResponseDecoderImpl) {
    return `ResponseDecoder(buffer=...)`;
  },

  toJSON(this: ResponseDecoderImpl) {
    return {
      _id: "ResponseDecoder",
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

export const make = (options?: {
  readonly bufferCapacity?: number;
  readonly channelCapacity?: number;
}) =>
  Effect.gen(function* () {
    const bufferCapacity = options?.bufferCapacity ?? 4;
    const channelCapacity = options?.channelCapacity ?? bufferCapacity * 2;

    // a single message is at most 64KiB, therefore we can allocate a buffer of capacity * 64KiB
    const buffer = new ArrayBuffer(bufferCapacity * 1024 * 64);

    const cursor: Cursor = {
      buffer,
      index: 0,
    };

    const bufferRef = yield* Ref.make(cursor);

    const mailbox = yield* Mailbox.make<Response.Response, ResponseDecodeError>(
      {
        capacity: channelCapacity,
        // we never ever suspend the decoder, if we can't decode a message we simply drop the message
        strategy: "dropping",
      },
    );

    return createProto(ResponseDecoderProto, {
      buffer: bufferRef,
      output: mailbox,
    }) satisfies ResponseDecoderImpl as ResponseDecoder;
  });

const cast = (encoder: ResponseDecoder): ResponseDecoderImpl =>
  encoder as unknown as ResponseDecoderImpl;

export const stream = (self: ResponseDecoder) =>
  Mailbox.toStream(cast(self).output);

export const length = (encoder: ResponseDecoder) =>
  Effect.gen(function* () {
    const impl = cast(encoder);

    const buffer = yield* Ref.get(impl.buffer);
    return buffer.index;
  });

export const get: {
  (
    index: number,
  ): (self: ResponseDecoder) => Effect.Effect<Option.Option<number>>;
  (self: ResponseDecoder, index: number): Effect.Effect<Option.Option<number>>;
} = Function.dual(
  2,
  (
    self: ResponseDecoder,
    index: number,
  ): Effect.Effect<Option.Option<number>> =>
    Effect.gen(function* () {
      const impl = cast(self);
      const count = yield* length(self);

      if (index < 0 || index >= count) {
        return Option.none();
      }

      const buffer = yield* Ref.get(impl.buffer);
      const view = new DataView(buffer.buffer, index, 1);
      return Option.some(view.getUint8(0));
    }),
);

type TupleMap<T extends readonly unknown[], U> = {
  readonly [K in keyof T]: U;
};

export const getMany: {
  <T extends readonly number[]>(
    indices: T,
  ): (
    self: ResponseDecoder,
  ) => Effect.Effect<Option.Option<TupleMap<T, number>>>;
  <T extends readonly number[]>(
    self: ResponseDecoder,
    indices: T,
  ): Effect.Effect<Option.Option<TupleMap<T, number>>>;
} = Function.dual(
  2,
  <T extends readonly number[]>(
    self: ResponseDecoder,
    indices: T,
  ): Effect.Effect<Option.Option<TupleMap<T, number>>> =>
    Effect.gen(function* () {
      const impl = cast(self);
      const count = yield* length(self);

      const result = new Array(indices.length);
      const buffer = yield* Ref.get(impl.buffer);

      for (let i = 0; i < indices.length; i++) {
        const index = indices[i]!;

        if (index < 0 || index >= count) {
          return Option.none();
        }

        const view = new DataView(buffer.buffer, index, 1);
        result[i] = view.getUint8(0);
      }

      return Option.some(result as { [K in keyof T]: number });
    }),
);

const sendPacket = (self: ResponseDecoder, packet: Response.Response) =>
  Effect.gen(function* () {
    const impl = cast(self);
    const mailbox = impl.output;

    const hasSent = yield* mailbox.offer(packet);

    if (!hasSent) {
      yield* Console.warn(
        "Unable to send response to receiver, stream has been closed. Dropping response.",
      );
    }
  });

const finishStream = (self: ResponseDecoder) =>
  Effect.gen(function* () {
    const impl = cast(self);
    const mailbox = impl.output;

    yield* mailbox.done(Exit.succeed(undefined));
  });

const tryDecodePacket = (self: ResponseDecoder) =>
  Effect.gen(function* () {
    // The length marker is always at bytes 30 and 31
    const lengthBytes = yield* getMany(self, [30, 31] as const);

    if (Option.isNone(lengthBytes)) {
      return false;
    }

    // length is encoded as a 16-bit unsigned integer, big-endian
    // eslint-disable-next-line no-bitwise
    const packetLength = (lengthBytes.value[0] << 8) | lengthBytes.value[1];

    const buffer = yield* Ref.get(cast(self).buffer);

    // we now need to check if the length we have in the buffer is enough to decode the full message (32 bytes header + length)
    const bufferLength = buffer.index;

    if (bufferLength < packetLength + 32) {
      // we cannot yet read the full message
      return false;
    }

    // take the whole packet out of the buffer and detach it
    // TODO: this is virtually the same as ArrayBuffer.transfer(), something that's part of ES2024
    const packetBuffer = new ArrayBuffer(packetLength + 32);
    const packet = new Uint8Array(packetBuffer);
    packet.set(new Uint8Array(buffer.buffer, 0, packetLength + 32));

    // remove the packet from the buffer (shift the rest of the buffer to the beginning)
    const byteBuffer = new Uint8Array(buffer.buffer);
    byteBuffer.copyWithin(0, packetLength + 32, bufferLength);

    // update the cursor to the new buffer length
    buffer.index -= packetLength + 32;

    // decode the message
    const reader = yield* Buffer.makeRead(new DataView(packet.buffer));

    const response = yield* Response.decode(reader);

    // send the decoded message to the output mailbox
    yield* sendPacket(self, response);

    if (ResponseFlags.isEndOfResponse(response.header.flags)) {
      yield* finishStream(self);
      // we don't need to decode any more packets, because the stream is closed
      return false;
    }

    return true;
  });

const tryDecode = (self: ResponseDecoder) =>
  Effect.gen(function* () {
    let hasMore = true;

    while (hasMore) {
      hasMore = yield* tryDecodePacket(self);
    }

    return self;
  });

const decode = (self: ResponseDecoder) =>
  Effect.gen(function* () {
    const impl = cast(self);

    yield* pipe(
      tryDecode(self),
      Effect.map(Function.constVoid),
      Effect.onError((cause) => {
        // send the error via the mailbox to the caller
        const mailbox = impl.output;
        return mailbox.failCause(cause);
      }),
      Effect.orElseSucceed(Function.constVoid),
    );

    return self;
  });

export const push: {
  (
    array: Uint8Array,
  ): (self: ResponseDecoder) => Effect.Effect<ResponseDecoder>;
  (self: ResponseDecoder, array: Uint8Array): Effect.Effect<ResponseDecoder>;
} = Function.dual(2, (self: ResponseDecoder, array: Uint8Array) =>
  Effect.gen(function* () {
    const impl = cast(self);

    const buffer = yield* Ref.get(impl.buffer);
    const cursor = buffer.index;

    const view = new Uint8Array(buffer.buffer, cursor, array.length);
    view.set(array);

    buffer.index += array.length;

    // notify background task to try to decode the message
    yield* decode(self);

    return self;
  }),
);

export const isResponseDecoder = (self: unknown): self is ResponseDecoder =>
  Predicate.hasProperty(self, TypeId);
