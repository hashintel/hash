import type { Mailbox } from "effect";
import { Effect, Function, Option, Ref } from "effect";

import * as Buffer from "../Buffer.js";
import { Response } from "../models/response/index.js";

const TypeId: unique symbol = Symbol(
  "@local/harpc-client/wire-protocol/codec/Encoder",
);

interface Cursor {
  buffer: ArrayBuffer;
  index: number;
}

export interface ResponseDecoder {
  [TypeId]: typeof TypeId;
}

interface ResponseDecoderImpl extends ResponseDecoder {
  readonly buffer: Ref.Ref<Cursor>;
  readonly output: Mailbox.Mailbox<Response.Response>;
}

const cast = (encoder: ResponseDecoder): ResponseDecoderImpl =>
  encoder as unknown as ResponseDecoderImpl;

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

// TODO: update mailbox
export const push: {
  (
    array: Uint8Array,
  ): (self: ResponseDecoder) => Effect.Effect<ResponseDecoder>;
  (self: ResponseDecoder, array: Uint8Array): Effect.Effect<ResponseDecoder>;
} = Function.dual(2, (encoder: ResponseDecoder, array: Uint8Array) =>
  Effect.gen(function* () {
    const impl = cast(encoder);

    const buffer = yield* Ref.get(impl.buffer);
    const cursor = buffer.index;

    const view = new Uint8Array(buffer.buffer, cursor, array.length);
    view.set(array);

    buffer.index += array.length;

    return encoder;
  }),
);

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

    // take the whole packet out of the buffer (cloning it)
    const buffer = yield* Ref.get(cast(self).buffer);

    // we now need to check if the length we have in the buffer is enough to decode the full message (32 bytes header + length)
    const bufferLength = buffer.index;

    if (bufferLength < packetLength + 32) {
      // we cannot yet read the full message
      return false;
    }

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
    const hasSent = yield* cast(self).output.offer(response);
    // TODO: handle if cannot be sent (error)

    // there might be another finished message in the buffer, try to decode it
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
