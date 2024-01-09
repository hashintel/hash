import { ParseError } from "@effect/schema/ParseResult";
import * as S from "@effect/schema/Schema";
import {
  AbortOptions,
  CodeError,
  ComponentLogger,
  ERR_TIMEOUT,
  Logger,
  PeerId,
  Startable,
} from "@libp2p/interface";
import { ConnectionManager } from "@libp2p/interface-internal";
import { type Multiaddr } from "@multiformats/multiaddr";
import { Cause, Chunk, Data, Duration, Effect, Exit, Stream } from "effect";
import { Scope } from "effect/Scope";

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

export interface HandlerComponents {
  connectionManager: ConnectionManager;
  logger: ComponentLogger;
}

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
  maxInboundStreams: S.optional(S.Positive.pipe(S.int()), { default: () => 2 }),
  maxOutboundStreams: S.optional(S.Positive.pipe(S.int()), {
    default: () => 1,
  }),
  runOnTransientConnection: S.optional(S.boolean, { default: () => true }),
});

interface IncompleteHandlerConfig extends S.Schema.From<typeof HandlerConfig> {}
interface HandlerConfig extends S.Schema.To<typeof HandlerConfig> {}

export interface Handler<E> {
  send(
    peer: PeerId | Multiaddr | Multiaddr[],
    request: Request,
    options?: AbortOptions,
  ): Effect.Effect<Scope, E, Response>;
}

export class DefaultHandler
  implements
    Startable,
    Handler<
      | TimeoutError
      | UnknownResponseError
      | Cause.UnknownException
      | UnexpectedEndOfStreamError
      | VariableIntegerOverflowError
      | UnsupportedTransportVersionError
      | ParseError
      | AbortedError
      | Cause.NoSuchElementException
    >
{
  private readonly log: Logger;
  private readonly config: HandlerConfig;

  public readonly protocol = "/hash/rpc/1";

  constructor(
    private readonly components: HandlerComponents,
    config: IncompleteHandlerConfig,
  ) {
    this.config = S.parseSync(HandlerConfig)(config);
    this.log = components.logger.forComponent("handler:websocket");
  }

  async start() {}

  async stop() {}

  send(
    peer: PeerId | Multiaddr | Multiaddr[],
    request: Request,
    options: AbortOptions = {},
  ) {
    return Effect.gen(this, function* (_) {
      const data = writeRequest(request);

      const connection = yield* _(
        Effect.tryPromise(() =>
          this.components.connectionManager.openConnection(peer, options),
        ),
      );

      const stream = yield* _(
        Effect.tryPromise((promiseSignal) => {
          const timeoutSignal = AbortSignal.timeout(
            Duration.toMillis(this.config.timeout),
          );

          timeoutSignal.addEventListener(
            "abort",
            () => {
              stream.abort(new CodeError("request timeout", ERR_TIMEOUT));
            },
            { once: true },
          );

          const allSignals = [promiseSignal, timeoutSignal];
          if (options.signal) {
            allSignals.push(options.signal);
          }

          const abortController = new AbortController();

          for (const signal of allSignals) {
            signal.addEventListener(
              "abort",
              () => {
                this.log("aborting stream");
                abortController.abort();
              },
              { once: true },
            );
          }

          return connection.newStream(this.protocol, {});
        }),
      );

      yield* _(
        Effect.addFinalizer((exit) => {
          if (Exit.isFailure(exit)) {
            stream.abort(new Error(Cause.pretty(exit.cause)));
          }

          return Effect.promise((signal) => stream.close({ signal }));
        }),
      );

      yield* _(Effect.promise(() => stream.sink([data])));

      const incomingStream = Stream.fromAsyncIterable(
        stream.source,
        (error) => new AbortedError({ message: String(error) }),
      );

      const chunks = yield* _(Stream.runCollect(incomingStream));
      const chunkArray = Chunk.toReadonlyArray(chunks);

      const bufferLength = chunkArray.reduce(
        (acc, chunk) => acc + chunk.length,
        0,
      );

      const buffer = new Uint8Array(bufferLength);

      let offset = 0;
      for (const chunk of chunkArray) {
        const view = chunk.subarray();
        buffer.set(view, offset);
        offset += view.length;
      }

      if (chunkArray.length === 0) {
        yield* _(new TimeoutError());
      }

      const response = yield* _(readResponse(buffer));
      return response;
    });
  }
}

export function defaultHandler(config: IncompleteHandlerConfig) {
  return (components: HandlerComponents): Handler<unknown> => {
    return new DefaultHandler(components, config);
  };
}
