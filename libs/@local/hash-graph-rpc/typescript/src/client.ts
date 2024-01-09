import { ProcedureId, ServiceId, ServiceVersion } from "./transport/common";
import { Response, ResponseFrom } from "./transport/response";
import { Request, RequestHeader } from "./transport/request";
import { ParseResult } from "@effect/schema";
import * as S from "@effect/schema/Schema";
import { TRANSPORT_VERSION } from "./transport";
import { Data, Effect } from "effect";
import { Handler, WebSocketHandler } from "./transport/handler";
import { Multiaddr } from "@multiformats/multiaddr";

export const EncodingContext = RequestHeader.pipe(S.pick("actor"));
export interface EncodingContext extends S.Schema.To<typeof EncodingContext> {}
export interface EncodingContextFrom
  extends S.Schema.From<typeof EncodingContext> {}

type ServiceInstance<
  S extends ServiceId,
  V extends ServiceVersion,
  T extends Record<string, never>,
> = {
  [key in keyof T]: T[key] extends Procedure<S, infer _P, infer Req, infer Res>
    ? (request: Req) => Promise<Res>
    : never;
};

interface Service<
  S extends ServiceId,
  V extends ServiceVersion,
  T extends Record<string, never>,
> {
  new (server: Multiaddr, handler: Handler<unknown>): ServiceInstance<S, V, T>;
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
    let requestSchema = S.transformOrFail(
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

    let responseSchema = S.transformOrFail(
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
      client: Client<unknown>;

      constructor(
        public server: Multiaddr,
        public handler: Handler<unknown>,
      ) {
        this.client = new Client(server, handler);
      }
    }

    for (const [name, procedure] of Object.entries(this.procedures)) {
      (ServiceImpl.prototype as any)[name] = function (
        this: ServiceImpl,
        request: any,
      ) {
        return Effect.runPromise(
          Effect.scoped(this.client.send(procedure, request)),
        );
      };
    }

    return ServiceImpl as any;
  }
}

export function service<
  const S extends ServiceId,
  const V extends ServiceVersion,
>(service: S, version: V) {
  return new ServiceBuilder(service, version, {});
}

export class Client<E> {
  constructor(
    public server: Multiaddr,
    public handler: Handler<E>,
  ) {}

  send<const S extends ServiceId, const P extends ProcedureId, Req, Res>(
    procedure: Procedure<S, P, Req, Res>,
    request: Req,
  ) {
    return Effect.gen(this, function* (_) {
      const encodedRequest = yield* _(S.parse(procedure.request)(request));

      const response = yield* _(this.handler.send(this.server, encodedRequest));

      const decodedResponse = yield* _(S.parse(procedure.response)(response));

      return decodedResponse;
    });
  }
}
