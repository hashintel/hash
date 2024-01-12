import * as S from "@effect/schema/Schema";
import { type Multiaddr } from "@multiformats/multiaddr";
import { Context, Effect, Layer } from "effect";

import { ActorId, ProcedureId, ServiceId } from "./transport/common";

import {
  Handler,
  HandlerConfigFrom,
  HandlerError,
  HandlerLive,
  TransportContext,
} from "./transport/handler";

import { Libp2p } from "@libp2p/interface";
import * as Procedure from "./Procedure";

export interface Client {
  readonly send: <
    const S extends ServiceId,
    const P extends ProcedureId,
    Req,
    Res,
  >(
    procedure: Procedure.Procedure<S, P, Req, Res>,
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
          procedure: Procedure.Procedure<S, P, Req, Res>,
          actor: ActorId,
          request: Req,
        ) =>
          Effect.gen(function* (_) {
            yield* _(Effect.logTrace("Encoding request"));
            const encodedRequest = yield* _(
              S.parse(procedure.request)([{ actor }, request]),
            );

            yield* _(Effect.logTrace("Sending request"));
            const response = yield* _(handler.send(server, encodedRequest));

            yield* _(Effect.logTrace("Decoding response"));
            const decodedResponse = yield* _(
              S.parse(procedure.response)(response),
            );

            return decodedResponse;
          }),
      });
    }),
  );

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
