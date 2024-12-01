import { noise } from "@chainsafe/libp2p-noise";
import { yamux } from "@chainsafe/libp2p-yamux";
import type { Identify } from "@libp2p/identify";
import { identify } from "@libp2p/identify";
import type { PingService } from "@libp2p/ping";
import { ping } from "@libp2p/ping";
import { tcp } from "@libp2p/tcp";
import { Data, Effect } from "effect";
import type { Libp2p } from "libp2p";
import { createLibp2p } from "libp2p";

import { createProto } from "../utils.js";
import * as NetworkLogger from "./NetworkLogger.js";

const TypeId: unique symbol = Symbol("@local/harpc-client/net/Client");
export type TypeId = typeof TypeId;

export class InitializationError extends Data.TaggedError(
  "InitializationError",
)<{ cause: unknown }> {
  get message() {
    return "Failed to initialize client";
  }
}

export interface Client {
  readonly [TypeId]: TypeId;
}

interface ClientImpl extends Client {
  readonly client: Libp2p<{ identify: Identify; ping: PingService }>;
}

const ClientProto: Omit<ClientImpl, "client"> = {
  [TypeId]: TypeId,
};

// TODO: add a metrics compatability layer

export const make = () =>
  Effect.gen(function* () {
    const logger = yield* NetworkLogger.make();

    // TODO: configuration
    const client = yield* Effect.tryPromise({
      try: () =>
        // TODO: configuration
        createLibp2p({
          logger,
          transports: [tcp()],
          streamMuxers: [yamux()],
          connectionEncrypters: [noise()],
          services: {
            identify: identify(),
            ping: ping(),
          },
          // TODO: unsure if we need this
          addresses: {
            listen: ["/ip4/0.0.0.0/tcp/0"],
          },
        }),
      catch: (cause) => new InitializationError({ cause }),
    });

    return createProto(ClientProto, { client }) satisfies ClientImpl as Client;
  });
