import { ParseResult } from "@effect/schema";
import * as S from "@effect/schema/Schema";
import { type Multiaddr } from "@multiformats/multiaddr";
import { Context, Effect, Layer } from "effect";
import { parse } from "uuid";

import {
  ActorId,
  ProcedureId,
  ServiceId,
  ServiceVersion,
} from "./transport/common";
import { TRANSPORT_VERSION } from "./transport/constants";
import {
  Handler,
  HandlerConfigFrom,
  HandlerError,
  HandlerLive,
  TransportContext,
} from "./transport/handler";
import { Request, RequestHeader } from "./transport/request";
import { Response, ResponseFrom } from "./transport/response";
import { Libp2p } from "@libp2p/interface";

export interface Client {
  readonly send: <
    const S extends ServiceId,
    const P extends ProcedureId,
    Req,
    Res,
  >(
    procedure: Procedure<S, P, Req, Res>,
    actor: ActorId,
    request: Req,
  ) => Effect.Effect<never, HandlerError, Res>;
}

export const Client = Context.Tag<Client>();

const ClientLive = (server: Multiaddr) =>
  Layer.effect(
    Client,
    Effect.gen(function* (_) {
      const handler = yield* _(Handler);

      return Client.of({
        send: <
          const S extends ServiceId,
          const P extends ProcedureId,
          Req,
          Res,
        >(
          procedure: Procedure<S, P, Req, Res>,
          actor: ActorId,
          request: Req,
        ) =>
          Effect.gen(function* (_) {
            const encodedRequest = yield* _(
              S.parse(procedure.request)([{ actor }, request]),
            );

            const response = yield* _(handler.send(server, encodedRequest));
            const decodedResponse = yield* _(
              S.parse(procedure.response)(response),
            );

            return decodedResponse;
          }),
      });
    }),
  );

export const EncodingContext = RequestHeader.pipe(S.pick("actor"));
export interface EncodingContextFrom
  extends S.Schema.From<typeof EncodingContext> {}

type ServiceInstance<
  S extends ServiceId,
  V extends ServiceVersion,
  T extends Record<string, never>,
> = {
  [key in keyof T]: T[key] extends Procedure<S, infer _P, infer Req, infer Res>
    ? (actor: string, request: Req) => Promise<Res>
    : never;
};

interface Service<
  S extends ServiceId,
  V extends ServiceVersion,
  T extends Record<string, never>,
> {
  new (state: ReturnType<typeof create>): ServiceInstance<S, V, T>;
}

export interface Procedure<
  S extends ServiceId,
  P extends ProcedureId,
  Req,
  Res,
> {
  service: S;
  procedure: P;

  request: S.Schema<readonly [EncodingContextFrom, Req], Request>;
  response: S.Schema<ResponseFrom, Res>;
}

class ServiceBuilder<
  S extends ServiceId,
  V extends ServiceVersion,
  T extends Record<string, never>,
> {
  constructor(
    public id: S,
    public version: V,
    public procedures: T,
  ) {}

  procedure<
    const N extends string,
    const P extends ProcedureId,
    ReqIn,
    ReqOut,
    ResIn,
    ResOut,
  >(
    name: N,
    id: P,
    request: S.Schema<ReqIn, ReqOut>,
    response: S.Schema<ResIn, ResOut>,
  ): ServiceBuilder<
    S,
    V,
    T & {
      [key in N]: Procedure<S, P, ReqIn, ResOut>;
    }
  > {
    const requestSchema = S.transformOrFail(
      S.tuple(EncodingContext, request),
      Request,
      ([context, req]) => {
        const content = JSON.stringify(req);
        const buffer = new TextEncoder().encode(content);

        return ParseResult.succeed({
          header: {
            flags: {},
            version: {
              transport: TRANSPORT_VERSION,
              service: this.version,
            },
            service: this.id,
            procedure: id,

            actor: context.actor,
            size: buffer.byteLength,
          },
          body: buffer,
        });
      },
      (_) => ParseResult.fail(ParseResult.forbidden),
    ) satisfies S.Schema<readonly [EncodingContextFrom, ReqIn], Request>;

    const responseSchema = S.transformOrFail(
      Response,
      response,
      (res) => {
        if ("error" in res.body) {
          throw new Error("not implemented");
        }

        const content = new TextDecoder().decode(res.body.body);
        const json = JSON.parse(content);

        return ParseResult.succeed(json);
      },
      (_) => ParseResult.fail(ParseResult.forbidden),
    ) satisfies S.Schema<ResponseFrom, ResOut>;

    return new ServiceBuilder(this.id, this.version, {
      ...this.procedures,
      [name]: {
        service: this.id,
        procedure: id,
        request: requestSchema,
        response: responseSchema,
      } satisfies Procedure<S, P, ReqIn, ResOut>,
    });
  }

  build(): Service<S, V, T> {
    class ServiceImpl {
      constructor(public state: ReturnType<typeof create>) {}
    }

    for (const [name, procedure] of Object.entries(this.procedures)) {
      (ServiceImpl.prototype as any)[name] = function (
        this: ServiceImpl,
        actor: string,
        request: any,
      ) {
        const actorId = ActorId(parse(actor) as Uint8Array);

        const effect = Effect.gen(function* (_) {
          const client = yield* _(Client);

          return yield* _(client.send(procedure, actorId, request));
        }).pipe(Effect.provide(this.state));

        return Effect.runPromise(effect);
      };
    }

    return ServiceImpl as any;
  }
}

export const create = (
  transport: Libp2p,
  server: Multiaddr,
  config: HandlerConfigFrom,
) => {
  const transportLayer = Layer.succeed(TransportContext, transport);
  const handler = HandlerLive(config);
  const client = ClientLive(server);

  return client.pipe(Layer.provide(handler), Layer.provide(transportLayer));
};

export function service<
  const S extends ServiceId,
  const V extends ServiceVersion,
>(service: S, version: V) {
  return new ServiceBuilder(service, version, {});
}
