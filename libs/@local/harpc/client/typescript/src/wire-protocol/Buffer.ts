import { Function } from "effect";

const TypeId: unique symbol = Symbol(
  "@local/harpc-client/wire-protocol/Buffer",
);
export type TypeId = typeof TypeId;

const Read: unique symbol = Symbol("@local/harpc-client/wire-protocol/Read");
export type Read = typeof Read;

const Write: unique symbol = Symbol("@local/harpc-client/wire-protocol/Write");
export type Write = typeof Write;

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

export const make = <T>(
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

export const makeRead = (view: DataView): Buffer<Read> => make(view, 0, Read);

// the buffer we write to is always a single page of 64KiB
export const makeWrite = (): Buffer<Write> =>
  make(new DataView(new ArrayBuffer(64 * 1024)), 0, Write);

// TODO: these need to error, what if we're no longer in bounds?!
export const putU8: {
  (value: number): (buffer: Buffer<Write>) => Buffer<Write>;
  (buffer: Buffer<Write>, value: number): Buffer<Write>;
} = Function.dual(
  2,
  (buffer: BufferImpl<Write>, value: number): Buffer<Write> => {
    // the buffer is shared, but the index isn't
    buffer.value.setUint8(buffer.index, value);

    return make(buffer.value, buffer.index + 1, Write);
  },
);

export const getU8 = (
  buffer: Buffer<Read>,
): [value: number, buffer: Buffer<Read>] => {
  const impl = buffer as unknown as BufferImpl<Read>;
  const value = impl.value.getUint8(impl.index);

  return [value, make(impl.value, impl.index + 1, Read)];
};

export const putU16: {
  (value: number): (buffer: Buffer<Write>) => Buffer<Write>;
  (buffer: Buffer<Write>, value: number): Buffer<Write>;
} = Function.dual(
  2,
  (buffer: BufferImpl<Write>, value: number): Buffer<Write> => {
    buffer.value.setUint16(buffer.index, value, false);

    return make(buffer.value, buffer.index + 2, Write);
  },
);

export const getU16 = (
  buffer: Buffer<Read>,
): [value: number, buffer: Buffer<Read>] => {
  const impl = buffer as unknown as BufferImpl<Read>;
  const value = impl.value.getUint16(impl.index, false);

  return [value, make(impl.value, impl.index + 2, Read)];
};

export const putU32: {
  (value: number): (buffer: Buffer<Write>) => Buffer<Write>;
  (buffer: Buffer<Write>, value: number): Buffer<Write>;
} = Function.dual(
  2,
  (buffer: BufferImpl<Write>, value: number): Buffer<Write> => {
    buffer.value.setUint32(buffer.index, value, false);

    return make(buffer.value, buffer.index + 4, Write);
  },
);

export const getU32 = (
  buffer: Buffer<Read>,
): [value: number, buffer: Buffer<Read>] => {
  const impl = buffer as unknown as BufferImpl<Read>;
  const value = impl.value.getUint32(impl.index, false);

  return [value, make(impl.value, impl.index + 4, Read)];
};

export const putU64: {
  (value: bigint): (buffer: Buffer<Write>) => Buffer<Write>;
  (buffer: Buffer<Write>, value: bigint): Buffer<Write>;
} = Function.dual(
  2,
  (buffer: BufferImpl<Write>, value: bigint): Buffer<Write> => {
    buffer.value.setBigUint64(buffer.index, value, false);

    return make(buffer.value, buffer.index + 8, Write);
  },
);

export const getU64 = (
  buffer: Buffer<Read>,
): [value: bigint, buffer: Buffer<Read>] => {
  const impl = buffer as unknown as BufferImpl<Read>;
  const value = impl.value.getBigUint64(impl.index, false);

  return [value, make(impl.value, impl.index + 8, Read)];
};

export const putSlice: {
  (value: Uint8Array): (buffer: Buffer<Write>) => Buffer<Write>;
  (buffer: Buffer<Write>, value: Uint8Array): Buffer<Write>;
} = Function.dual(
  2,
  (buffer: BufferImpl<Write>, value: Uint8Array): Buffer<Write> => {
    let index = buffer.index;

    const uint8Array = new Uint8Array(
      buffer.value.buffer,
      buffer.index,
      value.length,
    );
    uint8Array.set(value);
    index += value.length;

    return make(buffer.value, index, Write);
  },
);

export const getSlice = (
  buffer: Buffer<Read>,
  length: number,
): [value: Uint8Array, buffer: Buffer<Read>] => {
  const impl = buffer as unknown as BufferImpl<Read>;
  const value = new Uint8Array(impl.value.buffer, impl.index, length);
  const index = impl.index + length;

  return [value, make(impl.value, index, Read)];
};
