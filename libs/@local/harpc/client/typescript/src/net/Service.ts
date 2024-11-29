import {
  ComponentLogger,
  IncomingStreamData,
  Startable,
} from "@libp2p/interface";
import type {
  ConnectionManager,
  Registrar,
  StreamHandler,
} from "@libp2p/interface-internal";
import {
  Chunk,
  Data,
  Effect,
  Iterable,
  Predicate,
  PubSub,
  Queue,
  Ref,
  Sink,
  Stream,
} from "effect";
import {
  Sink as IteratorSink,
  Source as IteratorSource,
} from "it-stream-types";

const TypeId: unique symbol = Symbol("@local/harpc-client/net/Service");

/** @internal */
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

interface Handler {
  (impl: ServiceImpl): StreamHandler;
}

export interface Service {
  readonly [TypeId]: TypeId;

  readonly protocol: "/harpc/1.0.0";
}

interface ServiceImpl extends Service, Startable {
  readonly config: Config;
  readonly components: ServiceComponents;

  readonly handler: Handler;

  readonly ready: Ref.Ref<boolean>;
}

const handler = (impl: ServiceImpl) => {
  return () => (data: IncomingStreamData) =>
    Effect.gen(function* () {
      const { stream, connection } = data;

      yield* Effect.logDebug("incoming stream").pipe(
        Effect.annotateLogs({
          remote: connection.remotePeer,
        }),
      );

      const readStream = Stream.fromAsyncIterable(
        stream.source,
        (cause) => new TransportError({ cause }),
      );

      const writeSink = Sink.forEachChunk((chunk: Chunk.Chunk<Uint8Array>) =>
        Effect.try({
          try: () => stream.sink(chunk),
          catch: (cause) => new TransportError({ cause }),
        }),
      );

      // TODO: do we need timeout?
    }).pipe(Effect.withSpan("Service::handle"));
};

const ServiceProto: Omit<
  ServiceImpl,
  "handler" | "config" | "components" | "registered"
> = {
  [TypeId]: TypeId,

  protocol: "/harpc/1.0.0",

  start(this: ServiceImpl) {
    return Effect.gen(this, function* () {
      yield* Effect.tryPromise(() =>
        this.components.registrar.handle(
          this.protocol,
          this.handler.handle(this),
          {
            maxInboundStreams: this.config.maxInboundsStreams,
            maxOutboundStreams: this.config.maxOutboundsStreams,
            runOnLimitedConnection: this.config.runOnLimitedConnection,
          },
        ),
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
