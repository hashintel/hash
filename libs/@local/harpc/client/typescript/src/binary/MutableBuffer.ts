import { Data, Either, Function, pipe, Pipeable } from "effect";

import { createProto } from "../utils.js";

import * as MutableBytes from "./MutableBytes.js";

const TypeId: unique symbol = Symbol(
  "@local/harpc-client/binary/MutableBuffer",
);

export type TypeId = typeof TypeId;

export interface MutableBuffer<T> extends Pipeable.Pipeable {
  readonly [TypeId]: TypeId;
  readonly mode: T;
}

const Read: unique symbol = Symbol(
  "@local/harpc-client/wire-protocol/Buffer/Read",
);

export type Read = typeof Read;

export type ReadBuffer = MutableBuffer<Read>;

export type ReadResult<T, E = UnexpectedEndOfBufferError> = Either.Either<T, E>;

const Write: unique symbol = Symbol(
  "@local/harpc-client/wire-protocol/Buffer/Write",
);

export type Write = typeof Write;

export type WriteBuffer = MutableBuffer<Write>;

export type WriteResult<E = UnexpectedEndOfBufferError> = Either.Either<
  WriteBuffer,
  E
>;

export class UnexpectedEndOfBufferError extends Data.TaggedError(
  "UnexpectedEndOfBufferError",
)<{ index: number; length: number }> {
  get message(): string {
    return `Unexpected end of buffer at index ${this.index} of length ${this.length}`;
  }
}

interface MutableBufferImpl<T> extends MutableBuffer<T> {
  bytes: MutableBytes.MutableBytes;
  index: number;
}

const MutableBufferProto: Omit<
  MutableBufferImpl<unknown>,
  "bytes" | "index" | "mode"
> = {
  [TypeId]: TypeId,

  pipe() {
    // eslint-disable-next-line prefer-rest-params
    return Pipeable.pipeArguments(this, arguments);
  },
};

const makeUnchecked = <T>(bytes: MutableBytes.MutableBytes, mode: T) =>
  createProto(
    MutableBufferProto,
    {
      mode,
      bytes,
    },
    {
      index: 0,
    },
  ) satisfies MutableBufferImpl<T> as MutableBuffer<T>;

export const makeRead = (bytes: MutableBytes.MutableBytes): ReadBuffer =>
  makeUnchecked(bytes, Read);

export const makeWrite = (buffer?: MutableBytes.MutableBytes): WriteBuffer =>
  makeUnchecked(
    MutableBytes.require(
      buffer ?? MutableBytes.make({ initialCapacity: 64 * 1024 }),
      64 * 1024,
    ),
    Write,
  );

const validateBounds = <T>(
  self: MutableBuffer<T>,
  width: number,
): Either.Either<void, UnexpectedEndOfBufferError> => {
  const impl = self as MutableBufferImpl<T>;

  return impl.index + width > MutableBytes.length(impl.bytes)
    ? Either.left(
        new UnexpectedEndOfBufferError({
          index: impl.index,
          length: MutableBytes.length(impl.bytes),
        }),
      )
    : Either.right(undefined);
};

/**
 * Put a variable-length integer into the buffer.
 *
 * Writes an integer of specified width to the internal buffer at the current index.
 *
 * # Note
 *
 * This operation mutates the buffer by writing the value and advancing the index.
 *
 * # Errors
 *
 * May fail with `UnexpectedEndOfBufferError` if there's not enough space in the buffer.
 */
const putInt = (sign: "u" | "i", width: 1 | 2 | 4) =>
  Function.dual<
    (value: number) => (self: WriteBuffer) => WriteResult,
    (self: WriteBuffer, value: number) => WriteResult
  >(2, (self, value) =>
    pipe(
      validateBounds(self, width),
      Either.map(() => {
        const impl = self as MutableBufferImpl<Write>;
        const view = MutableBytes.asDataView(impl.bytes);

        if (sign === "i" && width === 1) {
          view.setInt8(impl.index, value);
        } else if (sign === "i" && width === 2) {
          view.setInt16(impl.index, value, false);
        } else if (sign === "i" && width === 4) {
          view.setInt32(impl.index, value, false);
        } else if (sign === "u" && width === 1) {
          view.setUint8(impl.index, value);
        } else if (sign === "u" && width === 2) {
          view.setUint16(impl.index, value, false);
        } else if (sign === "u" && width === 4) {
          view.setUint32(impl.index, value, false);
        } else {
          throw new Error("unreachable");
        }

        impl.index = impl.index + width;

        return self;
      }),
    ),
  );

export const putU8 = putInt("u", 1);
export const putU16 = putInt("u", 2);
export const putU32 = putInt("u", 4);

export const putI8 = putInt("i", 1);
export const putI16 = putInt("i", 2);
export const putI32 = putInt("i", 4);

/**
 * Read a variable-length integer from the buffer.
 *
 * Reads an integer of specified width from the buffer at the current index.
 *
 * # Note
 *
 * This operation advances the buffer's internal index after reading.
 *
 * # Errors
 *
 * May fail with `UnexpectedEndOfBufferError` if there's not enough data in the buffer.
 */
const getInt = (sign: "u" | "i", width: 1 | 2 | 4) => (self: ReadBuffer) =>
  pipe(
    validateBounds(self, width),
    Either.map(() => {
      const impl = self as MutableBufferImpl<Read>;
      const view = MutableBytes.asDataView(impl.bytes);

      let value: number;

      if (sign === "i" && width === 1) {
        value = view.getInt8(impl.index);
      } else if (sign === "i" && width === 2) {
        value = view.getInt16(impl.index, false);
      } else if (sign === "i" && width === 4) {
        value = view.getInt32(impl.index, false);
      } else if (sign === "u" && width === 1) {
        value = view.getUint8(impl.index);
      } else if (sign === "u" && width === 2) {
        value = view.getUint16(impl.index, false);
      } else if (sign === "u" && width === 4) {
        value = view.getUint32(impl.index, false);
      } else {
        throw new Error("unreachable");
      }

      impl.index = impl.index + width;

      return value;
    }),
  );

export const getU8 = getInt("u", 1);
export const getU16 = getInt("u", 2);
export const getU32 = getInt("u", 4);

export const getI8 = getInt("i", 1);
export const getI16 = getInt("i", 2);
export const getI32 = getInt("i", 4);

export const putSlice = Function.dual<
  (value: Uint8Array) => (self: WriteBuffer) => WriteResult,
  (self: WriteBuffer, value: Uint8Array) => WriteResult
>(2, (self, value) =>
  pipe(
    validateBounds(self, value.length),
    Either.map(() => {
      const impl = self as MutableBufferImpl<Write>;

      const slice = MutableBytes.asArray(impl.bytes);

      slice.set(value, impl.index);

      impl.index = impl.index + value.length;

      return self;
    }),
  ),
);

export const getSlice = (self: ReadBuffer, byteLength: number) =>
  pipe(
    validateBounds(self, byteLength),
    Either.map(() => {
      const impl = self as MutableBufferImpl<Read>;

      const slice = MutableBytes.asArray(impl.bytes).slice(
        impl.index,
        impl.index + byteLength,
      );

      // clone the buffer
      const clone = new ArrayBuffer(byteLength);
      const value = new Uint8Array(clone);

      value.set(slice);

      impl.index = impl.index + byteLength;

      return value;
    }),
  );

export const advance = Function.dual<
  (
    length: number,
  ) => <T>(
    self: MutableBuffer<T>,
  ) => Either.Either<MutableBuffer<T>, UnexpectedEndOfBufferError>,
  <T>(
    self: MutableBuffer<T>,
    length: number,
  ) => Either.Either<MutableBuffer<T>, UnexpectedEndOfBufferError>
>(2, <T>(self: MutableBuffer<T>, byteLength: number) =>
  pipe(
    validateBounds(self, byteLength),
    Either.map(() => {
      const impl = self as MutableBufferImpl<T>;

      impl.index = impl.index + byteLength;

      return self;
    }),
  ),
);

export const remaining = (self: ReadBuffer) => {
  const impl = self as MutableBufferImpl<Read>;

  return MutableBytes.length(impl.bytes) - impl.index;
};

export const length = (self: WriteBuffer) => {
  const impl = self as MutableBufferImpl<Write>;

  return impl.index;
};

export const take = (self: WriteBuffer) => {
  const impl = self as MutableBufferImpl<Write>;

  const slice = MutableBytes.asBuffer(impl.bytes).slice(0, impl.index);

  return slice;
};
