import type { PeerId } from "@libp2p/interface";
import type { Multiaddr } from "@multiformats/multiaddr";
import type { Chunk } from "effect";
import {
  Data,
  Deferred,
  Duration,
  Effect,
  MutableHashMap,
  Option,
  pipe,
  Queue,
  Sink,
  Stream,
} from "effect";

import { Buffer, RequestIdProducer } from "../wire-protocol/index.js";
import type { RequestId } from "../wire-protocol/models/request/index.js";
import { Request as WireRequest } from "../wire-protocol/models/request/index.js";
import type { Response as WireResponse } from "../wire-protocol/models/response/index.js";
import { ResponseFlags } from "../wire-protocol/models/response/index.js";
import { ResponseFromBytesStream } from "../wire-protocol/stream/index.js";
import type { IncompleteResponseError } from "../wire-protocol/stream/ResponseFromBytesStream.js";
import type * as internalTransport from "./internal/transport.js";

const TypeId: unique symbol = Symbol("@local/harpc-client/net/Connection");
export type TypeId = typeof TypeId;

export class TransportError extends Data.TaggedError("TransportError")<{
  cause: unknown;
}> {
  get message() {
    return "Underlying transport stream experienced an error";
  }
}

interface ConnectionDuplex {
  readonly read: Stream.Stream<
    WireResponse.Response,
    TransportError | WireResponse.DecodeError | IncompleteResponseError
  >;

  readonly write: Sink.Sink<
    void,
    WireRequest.Request,
    never,
    TransportError | WireRequest.EncodeError
  >;
}

export interface ConnectionConfig {
  /**
   * The maximum duration to wait for a response before considering the transaction lagged.
   * If a response is not received within this timeout, the transaction will be dropped.
   *
   * @default 200ms
   */
  lagTimeout?: Duration.DurationInput;

  /**
   * The size of the number of buffered responses to keep in memory.
   * A larger buffer can improve performance and allows for more lenient timeouts,
   * but consumes more memory. (a single response is a maximum of 64KiB)
   *
   * @default 16
   */
  responseBufferSize?: number;

  maxOutboundStreams?: number;
  runOnLimitedConnection?: boolean;
}

export interface Connection {
  [TypeId]: TypeId;
}

interface TransactionTask {
  queue: Queue.Enqueue<WireResponse.Response>;
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

const makeSink = (connection: ConnectionImpl) =>
  // eslint-disable-next-line unicorn/no-array-for-each
  Sink.forEach((response: WireResponse.Response) =>
    Effect.gen(function* () {
      const id = response.header.requestId;

      const transaction = MutableHashMap.get(connection.transactions, id);
      if (Option.isNone(transaction)) {
        yield* Effect.logWarning("response without a transaction found");

        return;
      }

      const lagTimeout = connection.config.lagTimeout ?? Duration.seconds(0.2);

      const isOnline = yield* pipe(
        Queue.offer(transaction.value.queue, response),
        Effect.timeout(lagTimeout),
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
  drop: Deferred.Deferred<void>,
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
      yield* dropImpl.value;
    }
  });

const task = (connection: ConnectionImpl) =>
  Effect.gen(function* () {
    const sink = makeSink(connection);

    // We don't need to monitor if the connection itself closes as that simply means that our stream would end.
    yield* Stream.run(connection.duplex.read, sink);
  });

/** @internal */
export const makeUnchecked = (
  transport: internalTransport.Transport,
  config: ConnectionConfig,
  peer: PeerId | Multiaddr | Multiaddr[],
) =>
  Effect.gen(function* () {
    const connection = yield* Effect.tryPromise((abort) =>
      transport.dial(peer, { signal: abort }),
    );

    const stream = yield* Effect.acquireRelease(
      Effect.tryPromise((abort) =>
        connection.newStream("/harpc/1.0.0", {
          signal: abort,
          maxOutboundStreams: config.maxOutboundStreams,
          runOnLimitedConnection: config.runOnLimitedConnection,
        }),
      ),
      (_) => Effect.promise(() => _.close()),
    );

    const readStream = pipe(
      Stream.fromAsyncIterable(
        stream.source,
        (cause) => new TransportError({ cause }),
      ),
      Stream.mapConcat((list) => list),
      ResponseFromBytesStream.make,
    );

    const writeSink = pipe(
      Sink.forEachChunk((chunk: Chunk.Chunk<Uint8Array>) =>
        Effect.try({
          try: () => stream.sink(chunk),
          catch: (cause) => new TransportError({ cause }),
        }),
      ),
      Sink.mapInputEffect((request: WireRequest.Request) =>
        Effect.gen(function* () {
          const buffer = yield* Buffer.makeWrite();

          yield* WireRequest.encode(buffer, request);

          const array = yield* Buffer.take(buffer);
          return new Uint8Array(array);
        }),
      ),
    );

    const duplex = { read: readStream, write: writeSink } as ConnectionDuplex;

    // TODO: task
  });

export const send = <E, R>(
  connection: Connection,
  request: Request.Request<E, R>,
) =>
  Effect.gen(function* () {
    const impl = connection as ConnectionImpl;

    const deferredDrop = yield* Deferred.make<void>();

    const queue = yield* Queue.bounded(impl.config.responseBufferSize ?? 16);
  });

const transaction = (connection: ConnectionImpl) =>
  Effect.gen(function* () {
    const producer = yield* RequestIdProducer.RequestIdProducer;

    const id = yield* RequestIdProducer.next(producer);
  });

// TODO: Client that opens a stream to a server, then returns a connection, that connection can then be used to open a transaction!
// TODO: cleanup - what if we finish the stream, we need to drop to close the connection (that we do over scope on make!)
