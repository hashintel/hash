/* eslint-disable require-yield */
/*
 * Implementation of a byte array like the rust `Bytes` type,
 * making use of interior mutability.
 */

import type { Equal, Inspectable, Pipeable } from "effect";
import {
  Effect,
  Function,
  Iterable,
  Number,
  Ref,
  SynchronizedRef,
} from "effect";

const TypeId: unique symbol = Symbol("@local/harpc-client/wire-protocol/Bytes");

export type TypeId = typeof TypeId;

export interface Bytes
  extends Equal.Equal,
    Inspectable.Inspectable,
    Pipeable.Pipeable {
  readonly [TypeId]: typeof TypeId;
}

interface BytesImpl extends Bytes {
  readonly buffer: SynchronizedRef.SynchronizedRef<DataView[]>;
  readonly length: Ref.Ref<number>;
}

const cast = (value: Bytes): BytesImpl => value as BytesImpl;

const criticalSection = <A, E, R>(
  self: Bytes,
  fn: (
    bytes: BytesImpl,
    buffer: DataView[],
  ) => Effect.Effect<[A, DataView[]], E, R>,
): Effect.Effect<A, E, R> => {
  const impl = cast(self);

  return SynchronizedRef.modifyEffect(impl.buffer, (buffer) =>
    fn(impl, buffer),
  );
};

export const length = (value: Bytes) => cast(value).length.get;

export const push: {
  (bytes: ArrayBuffer): (self: Bytes) => Effect.Effect<Bytes>;
  (self: Bytes, bytes: ArrayBuffer): Effect.Effect<Bytes>;
} = Function.dual(2, (self: Bytes, bytes: ArrayBuffer) =>
  criticalSection(self, (impl, buffer) =>
    Effect.gen(function* () {
      const bytesLength = bytes.byteLength;

      yield* Ref.update(impl.length, Number.sum(bytesLength));

      buffer.push(new DataView(bytes));
      return [impl, buffer];
    }),
  ),
);

interface ByteView {
  offset: number;
  index: number;
  view: DataView;
}

/*
 * Splits the bytes into two at the given index.
 *
 * Afterwards self contains elements [0, at), and the returned Bytes contains elements [at, len).
 *
 * It’s guaranteed that the memory does not move, that is, the address of self does not change,
 * and the address of the returned slice is at bytes after that.
 *
 */
export const splitOff = (self: Bytes, index: number) =>
  criticalSection(self, (impl, buffer) =>
    Effect.gen(function* () {
      // find where we need to split the buffer in half
      const views: ByteView[] = [];

      let offset = 0;
      let viewIndex = 0;

      for (const view of buffer) {
        views.push({ view, offset, index: viewIndex });
        offset += view.byteLength;
        viewIndex += 1;
      }

      const containingView = Iterable.findFirst(
        views,
        (view) => view.offset + view.view.byteLength > index,
      );

      // if there is no containing view then we are splitting at the end of the buffer
      // TODO: this isn't correct lol
      // if (Option.isNone(containingView)) {
      //   return [impl, []];
      // }

      return [impl, buffer];
    }),
  );
