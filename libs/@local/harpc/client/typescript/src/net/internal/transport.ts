import { noise } from "@chainsafe/libp2p-noise";
import { yamux } from "@chainsafe/libp2p-yamux";
import type { Identify } from "@libp2p/identify";
import { identify } from "@libp2p/identify";
import type { PingService } from "@libp2p/ping";
import { ping } from "@libp2p/ping";
import { tcp } from "@libp2p/tcp";
import { Effect, Predicate } from "effect";
import type { Libp2p } from "libp2p";
import { createLibp2p } from "libp2p";

import * as NetworkLogger from "../NetworkLogger.js";
import type { TransportConfig } from "../Transport.js";
import { InitializationError } from "../Transport.js";

/** @internal */
export type Transport = Libp2p<{ identify: Identify; ping: PingService }>;

/** @internal */
export const make = (config?: TransportConfig) =>
  Effect.gen(function* () {
    const logger = yield* NetworkLogger.make();

    const connect = Effect.tryPromise({
      try: () =>
        createLibp2p({
          logger,
          transports: [tcp(config?.tcp)],
          streamMuxers: [yamux(config?.yamux)],
          connectionEncrypters: [noise(config?.noise)],
          services: {
            identify: identify(),
            ping: ping(),
          },
          // TODO: unsure if we need this
          // addresses: {
          //   listen: ["/ip4/0.0.0.0/tcp/0"],
          // },
        }),
      catch: (cause) => new InitializationError({ cause }),
    });

    const transport = yield* Effect.acquireRelease(connect, (client) =>
      Effect.promise(() => {
        const result = client.stop();
        return Predicate.isPromise(result) ? result : Promise.resolve(result);
      }),
    );

    return transport;
  });
