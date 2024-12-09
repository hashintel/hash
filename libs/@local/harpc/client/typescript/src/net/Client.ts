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

export const Client = GenericTag<Client>(TypeId.description!);

// TODO: add a metrics compatability layer
//  see: https://linear.app/hash/issue/H-3712/libp2p-metrics-compatibility-layer
export const make = (config?: ClientConfig) =>
  Effect.gen(function* () {
    const client = yield* internalTransport.make(config?.transport);

    return createProto(ClientProto, {
      client,
      config,
    }) satisfies ClientImpl as Client;
  });

export const layer = (config?: ClientConfig) =>
  Layer.scoped(Client, make(config));

export const connect: {
  (
    address: Transport.Address,
  ): (
    self: Client,
  ) => Effect.Effect<
    Connection.Connection,
    Transport.TransportError,
    Scope.Scope
  >;
  (
    self: Client,
    address: Transport.Address,
  ): Effect.Effect<
    Connection.Connection,
    Transport.TransportError,
    Scope.Scope
  >;
} = Function.dual(
  2,
  (
    self: ClientImpl,
    address: Transport.Address,
  ): Effect.Effect<
    Connection.Connection,
    Transport.TransportError,
    Scope.Scope
  > =>
    Connection.makeUnchecked(
      self.client,
      self.config?.connection ?? {},
      address,
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
