import type { Queue, Sink } from "effect";
import { Deferred, Effect, Stream } from "effect";

import type {
  Request as WireRequest,
  RequestId,
} from "../wire-protocol/models/request/index.js";
import type { Response as WireResponse } from "../wire-protocol/models/response/index.js";
import * as Request from "./Request.js";
import * as Response from "./Response.js";

const TypeId: unique symbol = Symbol("@local/harpc-client/net/Transaction");
export type TypeId = typeof TypeId;

export interface Transaction {
  [TypeId]: TypeId;

  readonly id: RequestId.RequestId;
}

interface TransactionImpl extends Transaction {
  readonly read: Queue.Dequeue<WireResponse.Response>;
  readonly write: Sink.Sink<WireRequest.Request>;

  readonly drop: Deferred.Deferred<void>;
}

// Wait: do we even need this?! Instead maybe you get a transaction back end then just send it.
// Then the name wouldn't work.

export const onDrop = (
  transaction: Transaction,
  execute: Effect.Effect<void>,
) =>
  Effect.gen(function* () {
    const impl = transaction as TransactionImpl;

    return yield* Deferred.completeWith(impl.drop, execute);
  });

export const send = <E, R>(
  transaction: Transaction,
  request: Request.Request<E, R>,
) =>
  Effect.gen(function* () {
    const impl = transaction as TransactionImpl;

    const repr = Request.encode(request);
    yield* Effect.fork(Stream.run(repr, impl.write));

    return yield* Response.decode(impl.read);
  });
