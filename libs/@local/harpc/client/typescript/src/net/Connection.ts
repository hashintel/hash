import type { Duration } from "effect";
import {
  Deferred,
  Effect,
  MutableHashMap,
  Option,
  pipe,
  Queue,
  Sink,
  Stream,
} from "effect";

import { RequestIdProducer } from "../wire-protocol/index.js";
import type {
  Request,
  RequestId,
} from "../wire-protocol/models/request/index.js";
import type { Response } from "../wire-protocol/models/response/index.js";
import { ResponseFlags } from "../wire-protocol/models/response/index.js";
import * as Transaction from "./Transaction.js";

interface ConnectionDuplex {
  readonly read: Stream.Stream<Response.Response>;
  readonly write: Sink.Sink<Request.Request>;
}

interface ConnectionConfig {
  lagTimeout: Duration.DurationInput;
}

export interface Connection {}

interface TransactionTask {
  queue: Queue.Enqueue<Response.Response>;
  drop: Effect.Effect<void>;
}

interface ConnectionImpl extends Connection {
  readonly transactions: MutableHashMap.MutableHashMap<
    RequestId.RequestId,
    TransactionTask
  >;

  readonly duplex: ConnectionDuplex;

  readonly config: ConnectionConfig;
}

// TODO: close the connection if ConnectionImpl is closed (needs scope!)

const makeSink = (connection: ConnectionImpl) =>
  // eslint-disable-next-line unicorn/no-array-for-each
  Sink.forEach((response: Response.Response) =>
    Effect.gen(function* () {
      const id = response.header.requestId;

      const transaction = MutableHashMap.get(connection.transactions, id);
      if (Option.isNone(transaction)) {
        yield* Effect.logWarning("response without a transaction found");

        return;
      }

      const isOnline = yield* pipe(
        Queue.offer(transaction.value.queue, response),
        Effect.timeout(connection.config.lagTimeout),
        Effect.catchTag("TimeoutException", (timeout) =>
          Effect.gen(function* () {
            yield* Effect.logWarning(
              "transaction has lagged behind too far, dropping it",
            ).pipe(Effect.annotateLogs({ timeout }));

            yield* transaction.value.drop;
          }),
        ),
      );

      if (isOnline === false) {
        yield* Effect.logWarning("transaction has been closed, dropping it");
        yield* transaction.value.drop;

        return;
      }

      if (ResponseFlags.isEndOfResponse(response.header.flags)) {
        yield* Effect.logDebug("end of response");

        yield* transaction.value.drop;
      }
    }).pipe(Effect.annotateLogs({ id: response.header.requestId })),
  );

// TODO: get remove so we can close the transaction, transaction can register an effect that's run when it's closed / dropped
const wrapDrop = (
  connection: ConnectionImpl,
  id: RequestId.RequestId,
  drop: Deferred.Deferred<Effect.Effect<void>>,
) =>
  Effect.gen(function* () {
    const transaction = MutableHashMap.get(connection.transactions, id);
    if (Option.isNone(transaction)) {
      yield* Effect.logWarning("transaction has been dropped multiple times");

      return;
    }

    MutableHashMap.remove(connection.transactions, id);
    yield* transaction.value.queue.shutdown;

    // call user defined drop function
    const dropImpl = yield* Deferred.poll(drop);
    if (Option.isSome(dropImpl)) {
      yield* yield* dropImpl.value;
    }
  });

const task = (connection: ConnectionImpl) =>
  Effect.gen(function* () {
    const sink = makeSink(connection);

    // We don't need to monitor if the connection itself closes as that simply means that our stream would end.
    yield* Stream.run(connection.duplex.read, sink);
  });

const transaction = (connection: ConnectionImpl) =>
  Effect.gen(function* () {
    const producer = yield* RequestIdProducer.RequestIdProducer;

    const id = yield* RequestIdProducer.next(producer);
  });

// TODO: Client that opens a stream to a server, then returns a connection, that connection can then be used to open a transaction!
// TODO: cleanup - what if we finish the stream, we need to drop to close the connection (that we do over scope on make!)
