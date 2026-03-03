import {
  type Scope,
  Chunk,
  Deferred,
  Duration,
  Effect,
  Function,
  MutableHashMap,
  Option,
  pipe,
  Queue,
  Sink,
  Stream,
} from "effect";
import { GenericTag } from "effect/Context";
import { isUint8ArrayList, Uint8ArrayList } from "uint8arraylist";

import { createProto } from "../utils.js";
import {
  type RequestId,
  Request as WireRequest,
} from "../wire-protocol/models/request/index.js";
import { MutableBuffer } from "../binary/index.js";
import {
  type Response as WireResponse,
  ResponseFlags,
} from "../wire-protocol/models/response/index.js";
import { ResponseFromBytesStream } from "../wire-protocol/stream/index.js";
import type { IncompleteResponseError } from "../wire-protocol/stream/ResponseFromBytesStream.js";

import * as internalTransport from "./internal/transport.js";
import * as Request from "./Request.js";
import * as Transaction from "./Transaction.js";
import * as Transport from "./Transport.js";

const TypeId: unique symbol = Symbol("@local/harpc-client/net/Connection");

export type TypeId = typeof TypeId;

interface ConnectionDuplex {
  readonly read: Stream.Stream<
    WireResponse.Response,
    | Transport.TransportError
    | WireResponse.DecodeError
    | IncompleteResponseError
  >;

  readonly write: Sink.Sink<
    void,
    WireRequest.Request,
    never,
    Transport.TransportError | WireRequest.EncodeError
  >;
}

export interface ConnectionConfig {
  /**
   * The maximum duration to wait for a response before considering the transaction lagged.
   * If a response is not received within this timeout, the transaction will be dropped.
   *
   * @defaultValue 200ms
   */
  lagTimeout?: Duration.DurationInput;

  /**
   * The size of the number of buffered responses to keep in memory.
   * A larger buffer can improve performance and allows for more lenient timeouts,
   * but consumes more memory. (a single response is a maximum of 64KiB).
   *
   * @defaultValue 16
   */
  responseBufferSize?: number;

  /**
   * If specified, and no handler has been registered with the registrar for the
   * successfully negotiated protocol, use this as the max outbound stream limit
   * for the protocol.
   */
  maxOutboundStreams?: number;

  /**
   * Opt-in to running over a limited connection - one that has restrictions
   * on the amount of data that may be transferred or how long it may be open for.
   *
   * These limits are typically enforced by a relay server, if the protocol
   * will be transferring a lot of data or the stream will be open for a long time
   * consider upgrading to a direct connection before opening the stream.
   *
   * @defaultValue false
   */
  runOnLimitedConnection?: boolean;
}

export interface Connection {
  [TypeId]: TypeId;
}

interface TransactionContext {
  queue: Queue.Enqueue<WireResponse.Response>;
  drop: Effect.Effect<void>;
}

interface ConnectionImpl extends Connection {
  readonly transactions: MutableHashMap.MutableHashMap<
    RequestId.RequestId,
    TransactionContext
  >;

  readonly duplex: ConnectionDuplex;

  readonly config: ConnectionConfig;
}

const ConnectionProto: Omit<
  ConnectionImpl,
  "transactions" | "duplex" | "config"
> = {
  [TypeId]: TypeId,
};

// eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- always defined
export const Connection = GenericTag<Connection>(TypeId.description!);

const makeSink = (connection: ConnectionImpl) =>
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
        yield* Effect.logTrace("end of response, running drop");

        yield* transaction.value.drop;
      }
    }).pipe(Effect.annotateLogs({ id: response.header.requestId })),
  );

const wrapDrop = Effect.fn("wrapDrop")(function* (
  connection: ConnectionImpl,
  id: RequestId.RequestId,
  drop: Deferred.Deferred<void>,
) {
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

const task = Effect.fn("task")(function* (connection: ConnectionImpl) {
  const sink = makeSink(connection);

  // We don't need to monitor if the connection itself closes as that simply means that our stream would end.
  yield* Stream.run(connection.duplex.read, sink);
});

/** @internal */
export const makeUnchecked = Effect.fn("makeUnchecked")(function* (
  transport: internalTransport.Transport,
  config: ConnectionConfig,
  peer: Transport.Address,
) {
  const connection = yield* internalTransport.connect(transport, peer);

  const stream = yield* Effect.acquireRelease(
    Effect.tryPromise({
      try: (abort) => {
        return connection.newStream("/harpc/1.0.0", {
          signal: abort,
          maxOutboundStreams: config.maxOutboundStreams,
          runOnLimitedConnection: config.runOnLimitedConnection,
        });
      },
      catch: (cause) => new Transport.TransportError({ cause }),
    }),
    (_) => Effect.promise((abort) => _.close({ signal: abort })),
  );

  const readStream = pipe(
    Stream.fromAsyncIterable(
      stream,
      (cause) => new Transport.TransportError({ cause }),
    ),
    Stream.mapConcat((list) => (isUint8ArrayList(list) ? list : [list])),
    // cast needed as uint8arraylist doesn't support Uint8Array<ArrayBuffer> yet
    Stream.map((array) =>
      // take the underlying buffer and slice it to the correct view
      (array.buffer as ArrayBuffer).slice(
        array.byteOffset,
        array.byteOffset + array.byteLength,
      ),
    ),
    ResponseFromBytesStream.make,
  );

  const writeSink = pipe(
    Sink.forEachChunk((chunk: Chunk.Chunk<Uint8Array>) =>
      Effect.gen(function* () {
        const shouldContinue = yield* Effect.try({
          try: () =>
            stream.send(Uint8ArrayList.fromUint8Arrays(Chunk.toArray(chunk))),
          catch: (cause) => new Transport.TransportError({ cause }),
        });

        if (!shouldContinue) {
          yield* Effect.promise((signal) => stream.onDrain({ signal }));
        }
      }),
    ),
    Sink.mapInputEffect((request: WireRequest.Request) =>
      Effect.gen(function* () {
        // in the future we might be able to re-use the allocated buffer (we would likely still need to copy the contents tho)
        const buffer = MutableBuffer.makeWrite();

        yield* WireRequest.encode(buffer, request);

        const array = MutableBuffer.take(buffer);

        return new Uint8Array(array);
      }),
    ),
  );

  const duplex = { read: readStream, write: writeSink } as ConnectionDuplex;

  const self: ConnectionImpl = createProto(ConnectionProto, {
    transactions: MutableHashMap.empty<
      RequestId.RequestId,
      TransactionContext
    >(),
    duplex,
    config,
  });

  // TODO: we might want to observe the task, for that we would need to have a partial connection that we then patch
  yield* Effect.fork(task(self));

  return self as Connection;
});

// these bounds are stricter than required, as we have no way to inform the remote about a failure in the underlying stream,
// see: https://linear.app/hash/issue/H-3748/request-interruption
export const send = Function.dual<
  <R>(
    request: Request.Request<never, R>,
  ) => (
    self: Connection,
  ) => Effect.Effect<Transaction.Transaction, never, Exclude<R, Scope.Scope>>,
  <R>(
    self: Connection,
    request: Request.Request<never, R>,
  ) => Effect.Effect<Transaction.Transaction, never, Exclude<R, Scope.Scope>>
>(
  2,
  Effect.fn("send")(function* (self, request) {
    const impl = self as ConnectionImpl;

    // eslint-disable-next-line @typescript-eslint/no-invalid-void-type -- it's indeed correct here
    const deferredDrop = yield* Deferred.make<void>();
    const drop = wrapDrop(impl, request.id, deferredDrop);

    const queue = yield* Queue.bounded<WireResponse.Response>(
      impl.config.responseBufferSize ?? 16,
    );

    const transactionContext: TransactionContext = {
      queue,
      drop,
    };

    MutableHashMap.set(impl.transactions, request.id, transactionContext);

    yield* Effect.fork(
      pipe(
        request, //
        Request.encode(),
        Stream.run(impl.duplex.write),
      ),
    );

    return Transaction.makeUnchecked(request.id, queue, deferredDrop);
  }),
);
