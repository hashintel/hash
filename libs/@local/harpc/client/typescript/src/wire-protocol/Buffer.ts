import { Data, Effect, Function, SubscriptionRef } from "effect";

const TypeId: unique symbol = Symbol(
  "@local/harpc-client/wire-protocol/Buffer",
);
export type TypeId = typeof TypeId;

const Read: unique symbol = Symbol(
  "@local/harpc-client/wire-protocol/Buffer/Read",
);
export type Read = typeof Read;

const Write: unique symbol = Symbol(
  "@local/harpc-client/wire-protocol/Buffer/Write",
);
export type Write = typeof Write;

export class UnexpectedEndOfBufferError extends Data.TaggedError(
  "UnexpectedEndOfBufferError",
)<{ index: number; length: number }> {
  get message(): string {
    return `Unexpected end of buffer at index ${this.index} of length ${this.length}`;
  }
}

export interface Buffer<T> {
  readonly [TypeId]: TypeId;
  readonly mode: T;
}

export type WriteBuffer = Buffer<Write>;
export type ReadBuffer = Buffer<Read>;

interface BufferImpl<T> extends Buffer<T> {
  value: DataView;
  index: SubscriptionRef.SubscriptionRef<number>;
}

const BufferProto: Omit<BufferImpl<unknown>, "value" | "index" | "mode"> = {
  [TypeId]: TypeId,
};

const validateBounds = <T>(
  buffer: BufferImpl<T>,
  index: number,
  width: number,
): Effect.Effect<void, UnexpectedEndOfBufferError> =>
  Effect.gen(function* () {
    if (index + width > buffer.value.byteLength) {
      yield* new UnexpectedEndOfBufferError({
        index,
        length: buffer.value.byteLength,
      });
    }
  });

const makeUnchecked = <T>(view: DataView, mode: T) =>
  Effect.gen(function* () {
    // the buffer we write to is always a single page of 64KiB
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    const object = Object.create(BufferProto);

    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    object.value = view;
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    object.index = yield* SubscriptionRef.make(0);
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    object.mode = mode;

    return object as Buffer<T>;
  });

export const makeRead = (view: DataView) => makeUnchecked(view, Read);

// the buffer we write to is always a single page of 64KiB
export const makeWrite = () =>
  makeUnchecked(new DataView(new ArrayBuffer(64 * 1024)), Write);

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
const putInt =
  (
    width: 1 | 2 | 4 | 8,
    set: (view: DataView, byteOffset: number, value: number) => void,
  ) =>
  (
    buffer: BufferImpl<Write>,
    value: number,
  ): Effect.Effect<Buffer<Write>, UnexpectedEndOfBufferError> =>
    SubscriptionRef.modifyEffect(buffer.index, (index) =>
      Effect.gen(function* () {
        yield* validateBounds(buffer, index, width);

        set(buffer.value, index, value);

        return [buffer, index + width] as const;
      }),
    );

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
const getInt =
  (width: 1 | 2 | 4 | 8, get: (view: DataView, byteOffset: number) => number) =>
  (buffer: Buffer<Read>): Effect.Effect<number, UnexpectedEndOfBufferError> =>
    SubscriptionRef.modifyEffect(
      (buffer as unknown as BufferImpl<Read>).index,
      (index) =>
        Effect.gen(function* () {
          yield* validateBounds(buffer as BufferImpl<Read>, index, width);

          const impl = buffer as unknown as BufferImpl<Read>;

          const value = get(impl.value, index);

          return [value, index + width] as const;
        }),
    );

export type WriteResult<
  E extends UnexpectedEndOfBufferError = UnexpectedEndOfBufferError,
> = Effect.Effect<Buffer<Write>, E>;

export type ReadResult<T = number> = Effect.Effect<
  T,
  UnexpectedEndOfBufferError
>;

type WriteSignature = {
  (value: number): (buffer: Buffer<Write>) => WriteResult;
  (buffer: Buffer<Write>, value: number): WriteResult;
};

export const putU8: WriteSignature = Function.dual(
  2,
  putInt(1, (view, byteOffset, value) => view.setUint8(byteOffset, value)),
);

export const getU8 = getInt(1, (view, byteOffset) => view.getUint8(byteOffset));

export const putU16: WriteSignature = Function.dual(
  2,
  putInt(2, (view, byteOffset, value) =>
    view.setUint16(byteOffset, value, false),
  ),
);

export const getU16 = getInt(2, (view, byteOffset) =>
  view.getUint16(byteOffset, false),
);

export const putU32: WriteSignature = Function.dual(
  2,
  putInt(4, (view, byteOffset, value) =>
    view.setUint32(byteOffset, value, false),
  ),
);

export const getU32 = getInt(4, (view, byteOffset) =>
  view.getUint32(byteOffset, false),
);

export const putSlice: {
  (value: Uint8Array): (buffer: Buffer<Write>) => WriteResult;
  (buffer: Buffer<Write>, value: Uint8Array): WriteResult;
} = Function.dual(
  2,
  (buffer: BufferImpl<Write>, value: Uint8Array): WriteResult =>
    SubscriptionRef.modifyEffect(buffer.index, (index) =>
      Effect.gen(function* () {
        yield* validateBounds(buffer, index, value.length);

        const uint8Array = new Uint8Array(
          buffer.value.buffer,
          index,
          value.length,
        );
        uint8Array.set(value);

        return [buffer, index + value.length] as const;
      }),
    ),
);

export const getSlice = (
  buffer: Buffer<Read>,
  length: number,
): ReadResult<Uint8Array> =>
  SubscriptionRef.modifyEffect(
    (buffer as unknown as BufferImpl<Read>).index,
    (index) =>
      Effect.gen(function* () {
        const impl = buffer as unknown as BufferImpl<Read>;

        yield* validateBounds(impl, index, length);

        // clone the buffer
        const clone = new ArrayBuffer(length);
        const value = new Uint8Array(clone);
        value.set(new Uint8Array(impl.value.buffer, index, length));

        return [value, index + length] as const;
      }),
  );

export const advance: {
  (length: number): <T>(buffer: Buffer<T>) => WriteResult;
  <T>(buffer: Buffer<T>, length: number): WriteResult;
} = Function.dual(2, <T>(buffer: Buffer<T>, length: number) =>
  SubscriptionRef.modifyEffect(
    (buffer as unknown as BufferImpl<T>).index,
    (index) =>
      Effect.gen(function* () {
        yield* validateBounds(buffer as BufferImpl<T>, index, length);

        return [buffer, index + length] as const;
      }),
  ),
);

export const remaining = (buffer: Buffer<Read>) =>
  Effect.gen(function* () {
    const impl = buffer as unknown as BufferImpl<Read>;

    const index = yield* SubscriptionRef.get(impl.index);

    return impl.value.byteLength - index;
  });

export const length = (buffer: Buffer<Write>) =>
  Effect.gen(function* () {
    const impl = buffer as unknown as BufferImpl<Write>;

    const index = yield* SubscriptionRef.get(impl.index);

    return index;
  });

export const take = (buffer: Buffer<Write>) =>
  Effect.gen(function* () {
    const currentLength = yield* length(buffer);

    const impl = buffer as unknown as BufferImpl<Write>;

    const inner = impl.value.buffer.slice(0, currentLength);
    return inner;
  });
