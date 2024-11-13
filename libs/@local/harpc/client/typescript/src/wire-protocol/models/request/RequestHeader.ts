const TypeId: unique symbol = Symbol(
  "@local/harpc-client/wire-protocol/models/request/RequestHeader",
);

export type TypeId = typeof TypeId;

export interface RequestHeader {
  readonly [TypeId]: TypeId;
}
