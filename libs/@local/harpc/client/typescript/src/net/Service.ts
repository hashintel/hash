import type {
  ComponentLogger,
  IncomingStreamData,
  PeerId,
  Startable,
} from "@libp2p/interface";
import type {
  ConnectionManager,
  Registrar,
  StreamHandler,
} from "@libp2p/interface-internal";
import type { Chunk, HashMap, PubSub, Queue } from "effect";
import { Data, Effect, pipe, Ref, Sink, Stream } from "effect";

import type {
  Request,
  RequestId,
} from "../wire-protocol/models/request/index.js";
import { ResponseFromBytesStream } from "../wire-protocol/stream/index.js";
import { Response } from "../wire-protocol/models/response/index.js";

const TypeId: unique symbol = Symbol("@local/harpc-client/net/Service");
export type TypeId = typeof TypeId;

export class TransportError extends Data.TaggedError("TransportError")<{
  cause: unknown;
}> {
  get message() {
    return "Underlying transport stream experienced an error";
  }
}

interface ServiceComponents {
  registrar: Registrar;
  connectionManager: ConnectionManager;
  logger: ComponentLogger;
}

interface Config {
  maxInboundsStreams?: number;
  maxOutboundsStreams?: number;
  runOnLimitedConnection?: boolean;

  /*
  Amount of messages that can be buffered before the sender is suspended.

  Default value is 16.
  */
  sendBufferSize?: number;
}

export interface Service {
  readonly [TypeId]: TypeId;

  readonly protocol: "/harpc/1.0.0";
}

interface ConnectionStream {
  peer: PeerId;

  read: Stream.Stream<Response.Response>;
  write: Sink.Sink<Request.Request>;
}

interface ServiceImpl extends Service, Startable {
  readonly config: Config;
  readonly components: ServiceComponents;

  readonly receivers: HashMap.HashMap<PeerId, []>;

  readonly ready: Ref.Ref<boolean>;
}

const handler = (impl: ServiceImpl) => () => (data: IncomingStreamData) =>
  Effect.gen(function* () {
    const { stream, connection } = data;
    // TODO: wait we might not even need this! WE DON'T NEED THIS! WE CAN JUST OPEN CONNECTION! (see echo example).
    // Then on the stream we can multiplex in and out through a pubsub / mailbox / routing?!
    // We do that simply by the RequestId!
    // That whole thing can then just run in a fork.

    yield* Effect.logDebug("incoming stream").pipe(
      Effect.annotateLogs({
        remote: connection.remotePeer,
      }),
    );

    const readStream = pipe(
      Stream.fromAsyncIterable(
        stream.source,
        (cause) => new TransportError({ cause }),
      ),
      Stream.mapConcat((list) => list),
      ResponseFromBytesStream.make,
    );

    const writeSink = Sink.forEachChunk((chunk: Chunk.Chunk<Uint8Array>) =>
      Effect.try({
        try: () => stream.sink(chunk),
        catch: (cause) => new TransportError({ cause }),
      }),
    );

    // TODO: do we need timeout?
  }).pipe(Effect.withSpan("Service::handle"), Effect.runFork);

const ServiceProto: Omit<
  ServiceImpl,
  "handler" | "config" | "components" | "registered"
> = {
  [TypeId]: TypeId,

  protocol: "/harpc/1.0.0",

  start(this: ServiceImpl) {
    return Effect.gen(this, function* () {
      yield* Effect.tryPromise(() =>
        this.components.registrar.handle(this.protocol, handler(this), {
          maxInboundStreams: this.config.maxInboundsStreams,
          maxOutboundStreams: this.config.maxOutboundsStreams,
          runOnLimitedConnection: this.config.runOnLimitedConnection,
        }),
      );

      yield* Ref.set(this.ready, true);
    }).pipe(Effect.runPromise);
  },

  stop(this: ServiceImpl) {
    return Effect.gen(this, function* () {
      yield* Effect.tryPromise(() =>
        this.components.registrar.unhandle(this.protocol),
      );

      yield* Ref.set(this.ready, false);
    }).pipe(Effect.runPromise);
  },
};
