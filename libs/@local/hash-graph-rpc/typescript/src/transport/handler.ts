import * as S from "@effect/schema/Schema";
import {
  AbortOptions,
  CodeError,
  ComponentLogger,
  ERR_TIMEOUT,
  IncomingStreamData,
  Logger,
  PeerId,
  Startable,
} from "@libp2p/interface";
import { ConnectionManager } from "@libp2p/interface-internal";
import { Registrar } from "@libp2p/interface-internal/src";
import { Multiaddr } from "@multiformats/multiaddr";
import { Cause, Data, Duration, Effect, Exit } from "effect";
import first from "it-first";
import { pipe } from "it-pipe";

import {
  UnexpectedEndOfStreamError,
  VariableIntegerOverflowError,
} from "./reader";
import { Request, writeRequest } from "./request";
import { readResponse, Response, UnknownResponseError } from "./response";

export class TimeoutError extends Data.TaggedError("Timeout") {}

export interface HandlerComponents {
  registrar: Registrar;
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

export interface Handler {
  send(
    peer: PeerId | Multiaddr | Multiaddr[],
    request: Request,
    options?: AbortOptions,
  ): Effect.Effect<
    never,
    | TimeoutError
    | UnknownResponseError
    | Cause.UnknownException
    | UnexpectedEndOfStreamError
    | VariableIntegerOverflowError
    | Cause.NoSuchElementException,
    Response
  >;
}

export class WebSocketHandler implements Startable, Handler {
  private readonly log: Logger;
  private readonly config: HandlerConfig;

  public readonly protocol = "/hash/rpc/1";
  private started: boolean = false;

  constructor(
    private readonly components: HandlerComponents,
    config: IncompleteHandlerConfig,
  ) {
    this.config = S.parseSync(HandlerConfig)(config);
    this.log = components.logger.forComponent("handler:websocket");
  }

  async start() {
    // await this.components.registrar.handle(this.protocol, this.handleMessage, {
    //   maxInboundStreams: this.config.maxInboundStreams,
    //   maxOutboundStreams: this.config.maxOutboundStreams,
    //   runOnTransientConnection: this.config.runOnTransientConnection,
    // });

    this.started = true;
  }

  async stop() {
    // await this.components.registrar.unhandle(this.protocol);
    this.started = false;
  }

  public get isStarted(): boolean {
    return this.started;
  }

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

          const signal: AbortSignal = AbortSignal.any(allSignals);

          return connection.newStream(this.protocol, { ...options, signal });
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

      const rawResponse = yield* _(
        Effect.tryPromise(() => {
          return pipe([data], stream, async (source) => first(source));
        }),
      );

      if (!rawResponse) {
        yield* _(new TimeoutError());
      }

      const response = yield* _(readResponse(rawResponse.subarray()));
      return response;
    });
  }
}
