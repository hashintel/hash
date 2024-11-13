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

interface BufferImpl<T> extends Buffer<T> {
  value: DataView;
  index: number;
}

const BufferProto: Omit<BufferImpl<unknown>, "value" | "index" | "mode"> = {
  [TypeId]: TypeId,
};

export const makeRead = (view: DataView): Buffer<Read> => {
  // the buffer we write to is always a single page of 64KiB
  // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
  const object = Object.create(BufferProto);

  // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
  object.value = view;
  // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
  object.index = 0;
  // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
  object.mode = Read;

  // eslint-disable-next-line @typescript-eslint/no-unsafe-return
  return object;
};

export const makeWrite = (): Buffer<Write> => {
  const object = makeRead(
    new DataView(new ArrayBuffer(64 * 1024)),
  ) as unknown as Buffer<Write>;

  object.mode = Write;

  return object;
};
