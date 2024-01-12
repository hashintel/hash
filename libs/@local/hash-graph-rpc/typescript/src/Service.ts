import {
  ActorId,
  ProcedureId,
  ServiceId,
  ServiceVersion,
} from "./transport/common";
import * as S from "@effect/schema/Schema";
import { Request } from "./transport/request";
import { Response, ResponseFrom } from "./transport/response";
import { ParseResult } from "@effect/schema";
import { TRANSPORT_VERSION } from "./transport/constants";
import { parse } from "uuid";
import { Effect } from "effect";
import * as Client from "./Client";
import * as Procedure from "./Procedure";

export const Id = ServiceId;
export const Version = ServiceVersion;

type ServiceInstance<
  S extends ServiceId,
  V extends ServiceVersion,
  T extends Record<string, never>,
> = {
  [key in keyof T]: T[key] extends Procedure.Procedure<
    S,
    infer _P,
    infer Req,
    infer Res
  >
    ? (actor: string, request: Req) => Promise<Res>
    : never;
};

interface Service<
  S extends ServiceId,
  V extends ServiceVersion,
  T extends Record<string, never>,
> {
  new (state: ReturnType<typeof Client.create>): ServiceInstance<S, V, T>;
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
      [key in N]: Procedure.Procedure<S, P, ReqIn, ResOut>;
    }
  > {
    const requestSchema = S.transformOrFail(
      S.tuple(Procedure.EncodingContext, request),
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
    ) satisfies S.Schema<
      readonly [Procedure.EncodingContextFrom, ReqIn],
      Request
    >;

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
      } satisfies Procedure.Procedure<S, P, ReqIn, ResOut>,
    });
  }

  build(): Service<S, V, T> {
    class ServiceImpl {
      constructor(public state: ReturnType<typeof Client.create>) {}
    }

    for (const [name, procedure] of Object.entries(this.procedures)) {
      (ServiceImpl.prototype as any)[name] = function (
        this: ServiceImpl,
        actor: string,
        request: any,
      ) {
        const actorId = ActorId(parse(actor) as Uint8Array);

        const effect = Effect.gen(function* (_) {
          const client = yield* _(Client.Client);

          return yield* _(client.send(procedure, actorId, request));
        }).pipe(Effect.provide(this.state));

        return Effect.runPromise(effect);
      };
    }

    return ServiceImpl as any;
  }
}

export const create = <
  const S extends ServiceId,
  const V extends ServiceVersion,
>(
  service: S,
  version: V,
) => new ServiceBuilder(service, version, {});
