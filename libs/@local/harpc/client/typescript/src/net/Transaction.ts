import type { Queue } from "effect";
import { Deferred, Effect, Streamable } from "effect";

import type { RequestId } from "../wire-protocol/models/request/index.js";
import type { Response as WireResponse } from "../wire-protocol/models/response/index.js";
import * as Response from "./Response.js";

const TypeId: unique symbol = Symbol("@local/harpc-client/net/Transaction");
export type TypeId = typeof TypeId;

export interface Transaction {
  [TypeId]: TypeId;

  readonly id: RequestId.RequestId;
}

interface TransactionImpl extends Transaction {
  readonly read: Queue.Dequeue<WireResponse.Response>;

  readonly drop: Deferred.Deferred<void>;
}

export const onDrop = (
  transaction: Transaction,
  execute: Effect.Effect<void>,
) =>
  Effect.gen(function* () {
    const impl = transaction as TransactionImpl;

    return yield* Deferred.completeWith(impl.drop, execute);
  });

export const read = (transaction: Transaction) =>
  Response.decode((transaction as TransactionImpl).read);
