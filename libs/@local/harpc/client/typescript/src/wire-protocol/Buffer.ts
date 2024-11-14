import { Data, Effect, Function } from "effect";

const TypeId: unique symbol = Symbol(
  "@local/harpc-client/wire-protocol/Buffer",
);
export type TypeId = typeof TypeId;

const Read: unique symbol = Symbol("@local/harpc-client/wire-protocol/Read");
export type Read = typeof Read;

const Write: unique symbol = Symbol("@local/harpc-client/wire-protocol/Write");
export type Write = typeof Write;

export class UnexpectedEndOfBufferError extends Data.TaggedError(
  "UnexpectedEndOfBufferError",
)<{ index: number; length: number }> {
  get message(): string {
    return `Unexpected end of buffer at index ${this.index} of length ${this.length}`;
  }
}

export interface Buffer<T> {
  [TypeId]: TypeId;
  mode: T;
}

export type WriteBuffer = Buffer<Write>;
export type ReadBuffer = Buffer<Read>;

interface BufferImpl<T> extends Buffer<T> {
  value: DataView;
  index: number;
}

const BufferProto: Omit<BufferImpl<unknown>, "value" | "index" | "mode"> = {
  [TypeId]: TypeId,
};

const validateBounds = <T>(
  buffer: BufferImpl<T>,
  width: number,
): Effect.Effect<void, UnexpectedEndOfBufferError> => {
  if (buffer.index + width > buffer.value.byteLength) {
    return Effect.fail(
      new UnexpectedEndOfBufferError({
        index: buffer.index,
        length: buffer.value.byteLength,
      }),
    );
  }

  return Effect.succeed(undefined);
};

const makeUnchecked = <T>(
  view: DataView,
  index: number,
  mode: T,
): BufferImpl<T> => {
  // the buffer we write to is always a single page of 64KiB
  // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
  const object = Object.create(BufferProto);

  // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
  object.value = view;
  // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
  object.index = index;
  // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
  object.mode = mode;

  // eslint-disable-next-line @typescript-eslint/no-unsafe-return
  return object;
};

export const makeRead = (view: DataView): Buffer<Read> =>
  makeUnchecked(view, 0, Read);

// the buffer we write to is always a single page of 64KiB
export const makeWrite = (): Buffer<Write> =>
  makeUnchecked(new DataView(new ArrayBuffer(64 * 1024)), 0, Write);

const putInt =
  (
    width: 1 | 2 | 4 | 8,
    set: (view: DataView, byteOffset: number, value: number) => void,
  ) =>
  (
    buffer: BufferImpl<Write>,
    value: number,
  ): Effect.Effect<Buffer<Write>, UnexpectedEndOfBufferError> =>
    Effect.gen(function* () {
      yield* validateBounds(buffer, width);

      set(buffer.value, buffer.index, value);

      return makeUnchecked(buffer.value, buffer.index + width, Write);
    });

const getInt =
  (width: 1 | 2 | 4 | 8, get: (view: DataView, byteOffset: number) => number) =>
  (
    buffer: Buffer<Read>,
  ): Effect.Effect<
    [value: number, buffer: Buffer<Read>],
    UnexpectedEndOfBufferError
  > =>
    Effect.gen(function* () {
      yield* validateBounds(buffer as BufferImpl<Read>, width);

      const impl = buffer as unknown as BufferImpl<Read>;
      const value = get(impl.value, impl.index);

      return [
        value,
        makeUnchecked(impl.value, impl.index + width, Read),
      ] as const;
    });

export type WriteResult = Effect.Effect<
  Buffer<Write>,
  UnexpectedEndOfBufferError
>;

export type ReadResult<T = number> = Effect.Effect<
  [value: T, buffer: Buffer<Read>],
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

export const putU64: WriteSignature = Function.dual(
  2,
  putInt(8, (view, byteOffset, value) =>
    view.setBigUint64(byteOffset, BigInt(value), false),
  ),
);

export const getU64 = getInt(8, (view, byteOffset) =>
  Number(view.getBigUint64(byteOffset, false)),
);

export const putSlice: {
  (value: Uint8Array): (buffer: Buffer<Write>) => WriteResult;
  (buffer: Buffer<Write>, value: Uint8Array): WriteResult;
} = Function.dual(
  2,
  (buffer: BufferImpl<Write>, value: Uint8Array): WriteResult =>
    Effect.gen(function* () {
      yield* validateBounds(buffer, value.length);

      let index = buffer.index;

      const uint8Array = new Uint8Array(
        buffer.value.buffer,
        buffer.index,
        value.length,
      );
      uint8Array.set(value);
      index += value.length;

      return makeUnchecked(buffer.value, index, Write);
    }),
);

export const getSlice = (
  buffer: Buffer<Read>,
  length: number,
): ReadResult<Uint8Array> =>
  Effect.gen(function* () {
    const impl = buffer as unknown as BufferImpl<Read>;

    yield* validateBounds(impl, length);

    const value = new Uint8Array(impl.value.buffer, impl.index, length);
    const index = impl.index + length;

    return [value, makeUnchecked(impl.value, index, Read)] as const;
  });
