import { type Effect, type Queue, Deferred, Function } from "effect";

import { createProto } from "../utils.js";
import type { RequestId } from "../wire-protocol/models/request/index.js";
import type { Response as WireResponse } from "../wire-protocol/models/response/index.js";

import * as Response from "./Response.js";

const TypeId: unique symbol = Symbol("@local/harpc-client/net/Transaction");

export type TypeId = typeof TypeId;

export interface Transaction {
  readonly [TypeId]: TypeId;

  readonly id: RequestId.RequestId;
}

interface TransactionImpl extends Transaction {
  readonly read: Queue.Dequeue<WireResponse.Response>;

  readonly drop: Deferred.Deferred<void>;
}

const TransactionProto: Omit<TransactionImpl, "id" | "read" | "drop"> = {
  [TypeId]: TypeId,
};

/** @internal */
export const makeUnchecked = (
  id: RequestId.RequestId,
  readQueue: Queue.Dequeue<WireResponse.Response>,
  drop: Deferred.Deferred<void>,
): Transaction =>
  createProto(TransactionProto, { id, read: readQueue, drop }) as Transaction;

// eslint-disable-next-line fsecond/no-inline-interfaces
export const registerDestructor: {
  (
    destructor: Effect.Effect<void>,
  ): (self: Transaction) => Effect.Effect<boolean>;
  (self: Transaction, destructor: Effect.Effect<void>): Effect.Effect<boolean>;
} = Function.dual(2, (self: TransactionImpl, destructor: Effect.Effect<void>) =>
  Deferred.completeWith(self.drop, destructor),
);

export const read = (transaction: Transaction) =>
  Response.decode((transaction as TransactionImpl).read);
