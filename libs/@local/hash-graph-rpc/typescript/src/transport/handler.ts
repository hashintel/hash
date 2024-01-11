import { ParseError } from "@effect/schema/ParseResult";
import * as S from "@effect/schema/Schema";
import { AbortOptions, type Libp2p, PeerId } from "@libp2p/interface";
import { type Multiaddr } from "@multiformats/multiaddr";
import {
  Cause,
  Chunk,
  Context,
  Data,
  Duration,
  Effect,
  Exit,
  Layer,
  Stream,
} from "effect";

import {
  UnexpectedEndOfStreamError,
  VariableIntegerOverflowError,
} from "./reader";
import { Request, writeRequest } from "./request";
import {
  readResponse,
  Response,
  UnknownResponseError,
  UnsupportedTransportVersionError,
} from "./response";

export class TimeoutError extends Data.TaggedError("Timeout") {}

export class AbortedError extends Data.TaggedError("Aborted")<{
  message: string;
}> {}

export const TransportContext = Context.Tag<Libp2p>();

const HandlerConfig = S.struct({
  timeout: S.optional(
    S.DurationFromMillis.pipe(
      S.greaterThanOrEqualToDuration(Duration.millis(0)),
      S.message(() => "timeout must be positive"),
    ),
    {
      default: () => Duration.millis(10000),
    },
  ),
  maxOutboundStreams: S.optional(S.Positive.pipe(S.int()), {
    default: () => 1,
  }),
  runOnTransientConnection: S.optional(S.boolean, { default: () => true }),
  negotiateFully: S.optional(S.boolean, { default: () => true }),
});

export interface HandlerConfigFrom
  extends S.Schema.From<typeof HandlerConfig> {}
interface HandlerConfig extends S.Schema.To<typeof HandlerConfig> {}

export type HandlerError =
  | TimeoutError
  | UnknownResponseError
  | Cause.UnknownException
  | UnexpectedEndOfStreamError
  | VariableIntegerOverflowError
  | UnsupportedTransportVersionError
  | ParseError
  | AbortedError
  | Cause.NoSuchElementException;

export interface Handler {
  readonly send: (
    peer: PeerId | Multiaddr | Multiaddr[],
    request: Request,
    options?: AbortOptions,
  ) => Effect.Effect<never, HandlerError, Response>;
}

export const Handler = Context.Tag<Handler>();

const timeout = (
  duration: Duration.Duration,
  byPromise: AbortSignal,
  byConfig?: AbortSignal,
) => {
  const byTimeout = AbortSignal.timeout(Duration.toMillis(duration));
  const allSignals = [byPromise, byTimeout];

  if (byConfig) {
    allSignals.push(byConfig);
  }

  const controller = new AbortController();

  const listener = () => {
    controller.abort();

    // remove all event listeners
    for (const signal of allSignals) {
      signal.removeEventListener("abort", listener);
    }
  };

  for (const signal of allSignals) {
    signal.addEventListener("abort", listener, { once: true });
  }

  return controller.signal;
};
const connect = (
  {
    transport,
    peer,
  }: { transport: Libp2p; peer: PeerId | Multiaddr | Multiaddr[] },
  config: HandlerConfig,
  external?: AbortOptions,
) =>
  Effect.acquireRelease(
    Effect.tryPromise((abort) => {
      const signal = timeout(config.timeout, abort, external?.signal);

      return transport.dialProtocol(peer, "/hash/rpc/1", {
        signal,
        maxOutboundStreams: config.maxOutboundStreams,
        runOnTransientConnection: config.runOnTransientConnection,
        negotiateFully: config.negotiateFully,
      });
    }),
    (connection, exit) => {
      if (Exit.isFailure(exit)) {
        connection.abort(new Error(Cause.pretty(exit.cause)));

        return Effect.unit;
      }

      return Effect.promise((signal) => connection.close({ signal }));
    },
  );

const collect = <I extends Iterable<Uint8Array>>(
  stream: Stream.Stream<never, AbortedError, I>,
) =>
  Effect.gen(function* (_) {
    const chunks = yield* _(
      Stream.runCollect(stream),
      Effect.map(Chunk.flatMap(Chunk.fromIterable)),
    );

    const totalLength = Chunk.reduce(
      chunks,
      0,
      (length, chunk) => length + chunk.length,
    );

    const { buffer } = Chunk.reduce(
      chunks,
      { buffer: new Uint8Array(totalLength), offset: 0 },
      ({ buffer, offset }, chunk) => {
        buffer.set(chunk, offset);

        return { buffer, offset: offset + chunk.length };
      },
    );

    return buffer;
  });

export const HandlerLive = (config: HandlerConfigFrom) =>
  Layer.effect(
    Handler,
    Effect.gen(function* (_) {
      const validatedConfig = yield* _(S.parseEither(HandlerConfig)(config));
      const transport = yield* _(TransportContext);

      return Handler.of({
        send: (peer, request, options) =>
          Effect.gen(function* (_) {
            const connection = yield* _(
              connect({ transport, peer }, validatedConfig, options),
            );

            yield* _(
              Effect.promise(() => connection.sink([writeRequest(request)])),
            );

            const responseStream = Stream.fromAsyncIterable(
              connection.source,
              (error) => new AbortedError({ message: String(error) }),
            );

            const responseBytes = yield* _(collect(responseStream));

            const response = yield* _(readResponse(responseBytes));

            return response;
          }).pipe(Effect.scoped),
      });
    }),
  );
