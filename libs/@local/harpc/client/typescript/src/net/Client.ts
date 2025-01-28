import { Effect, Function, Layer, type Scope } from "effect";
import { GenericTag } from "effect/Context";

import { createProto } from "../utils.js";

import * as Connection from "./Connection.js";
import * as internalTransport from "./internal/transport.js";
import type * as Transport from "./Transport.js";

const TypeId: unique symbol = Symbol("@local/harpc-client/net/Client");

export type TypeId = typeof TypeId;

export interface ClientConfig {
  transport?: Transport.TransportConfig;
  connection?: Connection.ConnectionConfig;
}

export interface Client {
  readonly [TypeId]: TypeId;
}

interface ClientImpl extends Client {
  readonly client: internalTransport.Transport;
  readonly config?: ClientConfig | undefined;
}

const ClientProto: Omit<ClientImpl, "client" | "config"> = {
  [TypeId]: TypeId,
};

// eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- TypeId is defined
export const Client = GenericTag<Client>(TypeId.description!);

// TODO: add a metrics compatability layer
//  see: https://linear.app/hash/issue/H-3712/libp2p-metrics-compatibility-layer

export const make = Effect.fn("make")(function* (config?: ClientConfig) {
  const client = yield* internalTransport.make(config?.transport);

  return createProto(ClientProto, {
    client,
    config,
  }) satisfies ClientImpl as Client;
});

export const layer = (config?: ClientConfig) =>
  Layer.scoped(Client, make(config));

export const connect = Function.dual<
  (
    address: Transport.Address,
  ) => (
    self: Client,
  ) => Effect.Effect<
    Connection.Connection,
    Transport.TransportError,
    Scope.Scope
  >,
  (
    self: Client,
    address: Transport.Address,
  ) => Effect.Effect<
    Connection.Connection,
    Transport.TransportError,
    Scope.Scope
  >
>(
  2,
  Effect.fn("connect")((self, address) =>
    Connection.makeUnchecked(
      (self as ClientImpl).client,
      (self as ClientImpl).config?.connection ?? {},
      address,
    ),
  ),
);

export const connectLayer = (address: Transport.Address) =>
  Layer.scoped(
    Connection.Connection,
    Effect.gen(function* () {
      const client = yield* Client;

      return yield* connect(client, address);
    }),
  );
