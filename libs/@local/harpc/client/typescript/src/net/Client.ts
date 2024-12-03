import { Effect, Function } from "effect";

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
  readonly config?: ClientConfig;
}

const ClientProto: Omit<ClientImpl, "client" | "config"> = {
  [TypeId]: TypeId,
};

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

export const connect: {
  (
    address: Transport.Address,
  ): (self: Client) => Effect.Effect<Connection.Connection>;
  (
    self: Client,
    address: Transport.Address,
  ): Effect.Effect<Connection.Connection>;
} = Function.dual(2, (self: ClientImpl, address: Transport.Address) =>
  Connection.makeUnchecked(self.client, self.config?.connection ?? {}, address),
);
