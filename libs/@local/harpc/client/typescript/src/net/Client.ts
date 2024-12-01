import { Effect } from "effect";

import { createProto } from "../utils.js";
import type * as Connection from "./Connection.js";
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
}

const ClientProto: Omit<ClientImpl, "client"> = {
  [TypeId]: TypeId,
};

// TODO: add a metrics compatability layer
export const make = (config?: ClientConfig) =>
  Effect.gen(function* () {
    const client = yield* internalTransport.make(config?.transport);

    return createProto(ClientProto, { client }) satisfies ClientImpl as Client;
  });
