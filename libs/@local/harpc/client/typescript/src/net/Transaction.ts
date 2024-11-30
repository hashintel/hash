import type { Queue, Sink } from "effect";
import { Deferred, Effect, Stream } from "effect";
import type { Response } from "../wire-protocol/models/response/index.js";
import type {
  Request,
  RequestId,
} from "../wire-protocol/models/request/index.js";

const TypeId: unique symbol = Symbol("@local/harpc-client/net/Transaction");
export type TypeId = typeof TypeId;

export interface Transaction {
  [TypeId]: TypeId;

  readonly id: RequestId.RequestId;
}

interface TransactionImpl extends Transaction {
  readonly read: Queue.Dequeue<Response.Response>;
  readonly write: Sink.Sink<Request.Request>;

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
