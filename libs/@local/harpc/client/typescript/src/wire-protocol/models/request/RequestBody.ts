import type { Either, Equal, Inspectable, Pipeable } from "effect";

const TypeId: unique symbol = Symbol(
  "@local/harpc-client/wire-protocol/models/request/RequestBody",
);
export type TypeId = typeof TypeId;

export interface RequestBody
  extends Equal.Equal,
    Inspectable.Inspectable,
    Pipeable.Pipeable {
  readonly [TypeId]: TypeId;

  readonly body: Either.Either<
    RequestBegin.RequestBegin,
    RequestFrame.RequestFrame
  >;
}
