import { noise } from "@chainsafe/libp2p-noise";
import { yamux } from "@chainsafe/libp2p-yamux";
import type { Identify } from "@libp2p/identify";
import { identify } from "@libp2p/identify";
import { isPeerId, type PeerId } from "@libp2p/interface";
import type { PingService } from "@libp2p/ping";
import { ping } from "@libp2p/ping";
import { tcp } from "@libp2p/tcp";
import { Array, Data, Effect, Option, pipe, Predicate } from "effect";
import type { Libp2p } from "libp2p";
import { createLibp2p } from "libp2p";

import * as NetworkLogger from "../NetworkLogger.js";
import type { Multiaddr, TransportConfig } from "../Transport.js";
import { InitializationError } from "../Transport.js";

/** @internal */
export type Transport = Libp2p<{ identify: Identify; ping: PingService }>;

/** @internal */
export type Address = PeerId | Multiaddr;

/** @internal */
export class TransportError extends Data.TaggedError("TransportError")<{
  cause: unknown;
}> {
  get message() {
    return "Underlying transport stream experienced an error";
  }
}

const resolvePeer = (transport: Transport, address: Address) =>
  Effect.gen(function* () {
    if (isPeerId(address)) {
      return Option.some(address);
    }

    const peers = yield* Effect.tryPromise({
      try: () =>
        transport.peerStore.all({
          filters: [
            (peer) =>
              peer.addresses.some((peerAddress) =>
                peerAddress.multiaddr.equals(address),
              ),
          ],
          limit: 1,
        }),
      catch: (cause) => new TransportError({ cause }),
    });

    return Array.head(peers).pipe(Option.map((_) => _.id));
  });

/** @internal */
export const connect = (transport: Transport, address: Address) =>
  Effect.gen(function* () {
    const peerId = yield* resolvePeer(transport, address);
    if (Option.isSome(peerId)) {
      yield* Effect.logTrace(
        "peer has been dialed before, attempting to reuse connection",
      ).pipe(Effect.annotateLogs({ peerId, address }));

      // we may have an existing connection
      const existingConnection = pipe(
        transport.getConnections(peerId.value),
        Array.head,
      );

      if (Option.isSome(existingConnection)) {
        yield* Effect.logDebug("reusing existing connection to peer").pipe(
          Effect.annotateLogs({ peerId, address, existingConnection }),
        );

        return existingConnection.value;
      }
    }

    // we tried to reuse an existing connection but failed, so forcing is the only option, this is to prevent race conditions where two simultanous connections are opened to the same peer
    yield* Effect.logDebug("forcing a new connection to peer").pipe(
      Effect.annotateLogs({ peerId, address }),
    );

    return yield* Effect.tryPromise({
      try: (abort) => transport.dial(address, { signal: abort, force: true }),
      catch: (cause) => new TransportError({ cause }),
    });
  });

/** @internal */
export const make = (config?: TransportConfig) =>
  Effect.gen(function* () {
    const logger = yield* NetworkLogger.make();

    const acquire = Effect.tryPromise({
      try: () =>
        createLibp2p({
          logger,
          transports: [tcp(config?.tcp)],
          streamMuxers: [yamux(config?.yamux)],
          connectionEncrypters: [noise(config?.noise)],
          services: {
            identify: identify(),
            ping: ping({ timeout: 20 * 1000 }),
          },
        }),
      catch: (cause) => new InitializationError({ cause }),
    });

    const transport = yield* Effect.acquireRelease(acquire, (client) =>
      Effect.promise(() => {
        const result = client.stop();
        return Predicate.isPromise(result) ? result : Promise.resolve(result);
      }),
    );

    return transport;
  });
