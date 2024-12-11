import { isIPv4, isIPv6 } from "@chainsafe/is-ip";
import { noise } from "@chainsafe/libp2p-noise";
import { yamux } from "@chainsafe/libp2p-yamux";
import type { Identify } from "@libp2p/identify";
import { identify } from "@libp2p/identify";
import { isPeerId, type PeerId } from "@libp2p/interface";
import type { PingService } from "@libp2p/ping";
import { ping } from "@libp2p/ping";
import { tcp } from "@libp2p/tcp";
import {
  type Answer,
  type DNS,
  dns as defaultDns,
  RecordType,
} from "@multiformats/dns";
import {
  multiaddr as makeMultiaddr,
  protocols as getProtocol,
  resolvers,
} from "@multiformats/multiaddr";
import {
  Array,
  Cache,
  Cause,
  Chunk,
  Data,
  Effect,
  Either,
  flow,
  Function,
  Iterable,
  Match,
  Option,
  pipe,
  Predicate,
  Stream,
} from "effect";
import type { Libp2p } from "libp2p";
import { createLibp2p } from "libp2p";

import * as NetworkLogger from "../NetworkLogger.js";
import type { DNSConfig, Multiaddr, TransportConfig } from "../Transport.js";
import { InitializationError } from "../Transport.js";
import * as HashableMultiaddr from "./multiaddr.js";

/** @internal */
export type Transport = Libp2p<{
  identify: Identify;
  ping: PingService;
  state: {
    config: TransportConfig;
    dns: DNS;
    cache: Cache.Cache<
      HashableMultiaddr.HashableMultiaddr,
      Option.Option<PeerId>,
      TransportError
    >;
  };
}>;

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

/** @internal */
export class DnsError extends Data.TaggedError("DnsError")<{
  cause: unknown;
}> {
  get message() {
    return "Underlying DNS resolver experienced an error";
  }
}

/** The package @multiaddr/dns typed their own API wrong, so we need to correct it */
type AnswerExt = Omit<Answer, "type"> & {
  type: RecordType | "A" | "AAAA";
};

const DNS_PROTOCOL = getProtocol("dns");
const DNS4_PROTOCOL = getProtocol("dns4");
const DNS6_PROTOCOL = getProtocol("dns6");
const DNS_CODES = [DNS_PROTOCOL.code, DNS4_PROTOCOL.code, DNS6_PROTOCOL.code];

const IPV4_PROTOCOL = getProtocol("ip4");
const IPV6_PROTOCOL = getProtocol("ip6");

const resolveDnsMultiaddrSegment =
  (dns: DNS) => (code: number, value?: string) =>
    Effect.gen(function* () {
      if (!DNS_CODES.includes(code)) {
        return [[code, value] as const];
      }

      if (value === undefined) {
        yield* Effect.logWarning(
          "domain of dns segment is undefined, skipping",
        ).pipe(Effect.annotateLogs({ code, value }));

        return [];
      }

      let fqdn = value;
      const types: RecordType[] = [];

      if (code === DNS_PROTOCOL.code || code === DNS4_PROTOCOL.code) {
        types.push(RecordType.A);

        if (isIPv4(fqdn)) {
          return [[IPV4_PROTOCOL.code, fqdn] as const];
        }
      }

      if (code === DNS_PROTOCOL.code || code === DNS6_PROTOCOL.code) {
        types.push(RecordType.AAAA);

        if (isIPv6(fqdn)) {
          return [[IPV6_PROTOCOL.code, fqdn] as const];
        }
      }

      if (!fqdn.endsWith(".")) {
        fqdn += ".";
      }

      // because of a bad implementation of @multiformats/dns we need to dispatch a query for each type
      const [errors, responses] = yield* Effect.partition(
        types,
        (type) =>
          Effect.tryPromise({
            try: (signal) => dns.query(fqdn, { types: type, signal }),
            catch: (cause) => new DnsError({ cause }),
          }).pipe(Effect.mapError((cause) => new TransportError({ cause }))),
        {
          concurrency: "unbounded",
        },
      );

      // if we have been successful at least once we can return the resolved addresses, otherwise error out
      if (responses.length === 0) {
        if (errors.length === 0) {
          return yield* Effect.die(
            new Error(
              "Expected either responses or errors as the types are always non-empty, received neither",
            ),
          );
        }

        const [head, ...tail] = errors;

        return yield* pipe(
          tail,
          Array.map(Cause.fail),
          Array.reduce(Cause.fail(head!), Cause.parallel),
          Effect.failCause,
        );
      }

      return pipe(
        responses,
        Array.flatMap((response) => response.Answer),
        Array.filterMap(
          Match.type<AnswerExt>().pipe(
            Match.whenOr(
              { type: RecordType.A },
              { type: "A" } as const,
              ({ data }) => [IPV4_PROTOCOL.code, data] as const,
            ),
            Match.whenOr(
              { type: RecordType.AAAA },
              { type: "AAAA" } as const,
              ({ data }) => [IPV6_PROTOCOL.code, data] as const,
            ),
            Match.option,
          ),
        ),
      );
    });

/**
 * Resolve DNS addresses in a multiaddr (excluding DNSADDR)
 *
 * @internal
 */
const resolveDnsMultiaddr = (multiaddr: Multiaddr, dns: DNS) => {
  const resolveSegment = resolveDnsMultiaddrSegment(dns);

  return pipe(
    Stream.fromIterable(multiaddr.stringTuples()),
    Stream.mapEffect(Function.tupled(resolveSegment), {
      concurrency: "unbounded",
    }),
    Stream.flattenIterables,
    Stream.runCollect,
    Effect.map(
      flow(
        Chunk.toReadonlyArray,
        Array.map(([code, data]) => [getProtocol(code).name, data] as const),
        Array.flatten,
        Array.filter(Predicate.isNotUndefined),
        Array.map((part) => `/${part}`),
        Array.join(""),
        makeMultiaddr,
      ),
    ),
    Effect.tap((resolved) =>
      Effect.logDebug("resolved DNS multiaddr").pipe(
        Effect.annotateLogs({
          multiaddr: multiaddr.toString(),
          resolved: resolved.toString(),
        }),
      ),
    ),
  );
};

/**
 * Recursively resolve DNSADDR multiaddrs
 *
 * Adapted from: https://github.com/libp2p/js-libp2p/blob/92f9acbc1d2aa7b1bb5a8e460e4e0b5770f4455c/packages/libp2p/src/connection-manager/utils.ts#L9
 */
const resolveDnsaddrMultiaddr = (multiaddr: Multiaddr, options: DNSConfig) =>
  Effect.gen(function* () {
    // check multiaddr resolvers
    const resolvable = Iterable.some(resolvers.keys(), (key) =>
      multiaddr.protoNames().includes(key),
    );

    // return multiaddr if it is not resolvable
    if (!resolvable) {
      return [multiaddr];
    }

    const resolved = yield* Effect.tryPromise({
      try: (signal) =>
        multiaddr.resolve({
          signal,
          dns: options.resolver,
          maxRecursiveDepth: options.maxRecursiveDepth,
        }),
      catch: (cause) => new TransportError({ cause }),
    });

    yield* Effect.logDebug("resolved multiaddr").pipe(
      Effect.annotateLogs({
        multiaddr: multiaddr.toString(),
        resolved: resolved.map((address) => address.toString()),
      }),
    );

    return resolved;
  });

const lookupPeer = (transport: Transport, address: Multiaddr) =>
  Effect.gen(function* () {
    const resolved = yield* pipe(
      resolveDnsaddrMultiaddr(address, {
        resolver: transport.services.state.dns,
        maxRecursiveDepth:
          transport.services.state.config.dns?.maxRecursiveDepth,
      }),
      Stream.fromIterableEffect,
      Stream.flatMap(
        (multiaddr) =>
          resolveDnsMultiaddr(multiaddr, transport.services.state.dns),
        { concurrency: "unbounded" },
      ),
      Stream.runCollect,
      Effect.map(Chunk.toReadonlyArray),
    );

    const peers = yield* Effect.tryPromise({
      try: () =>
        transport.peerStore.all({
          filters: [
            (peer) =>
              peer.addresses.some((peerAddress) =>
                resolved.some((resolvedAddress) =>
                  resolvedAddress.equals(peerAddress.multiaddr),
                ),
              ),
          ],
          limit: 1,
        }),
      catch: (cause) => new TransportError({ cause }),
    });

    return Array.head(peers).pipe(Option.map((peer) => peer.id));
  });

const resolvePeer = (
  cache: Cache.Cache<
    HashableMultiaddr.HashableMultiaddr,
    Option.Option<PeerId>,
    TransportError
  >,
  address: Address,
) =>
  Effect.gen(function* () {
    if (isPeerId(address)) {
      return Option.some(address);
    }

    const key = HashableMultiaddr.make(address);
    const peerIdEither = yield* cache.getEither(key);
    if (Either.isLeft(peerIdEither)) {
      yield* Effect.logTrace("resolved peerID from cache");
    } else {
      yield* Effect.logTrace("computed peerID");
    }

    const peerId = Either.merge(peerIdEither);
    if (Option.isNone(peerId)) {
      yield* Effect.logDebug(
        "unable to resolve peer to a known peer ID, invalidating cache to retry next time",
      );

      yield* cache.invalidate(key);
    }

    return peerId;
  }).pipe(Effect.annotateLogs({ address }));

/** @internal */
export const connect = (transport: Transport, address: Address) =>
  Effect.gen(function* () {
    const peerId = yield* resolvePeer(transport.services.state.cache, address);

    if (Option.isSome(peerId)) {
      yield* Effect.logTrace(
        "peer has been dialed before, attempting to reuse connection",
      ).pipe(Effect.annotateLogs({ peerId: peerId.value, address }));

      // we may have an existing connection
      const existingConnection = pipe(
        transport.getConnections(peerId.value),
        Array.head,
      );

      if (Option.isSome(existingConnection)) {
        yield* Effect.logDebug("reusing existing connection to peer").pipe(
          Effect.annotateLogs({
            peerId: peerId.value,
            address,
            existingConnection: existingConnection.value,
          }),
        );

        return existingConnection.value;
      }
    }

    // we tried to reuse an existing connection but failed, so forcing is the only option, this is to prevent race conditions where two simultaneous connections are opened to the same peer
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

    const clientDns = config?.dns?.resolver ?? defaultDns();
    const cache: Cache.Cache<
      HashableMultiaddr.HashableMultiaddr,
      Option.Option<PeerId>,
      TransportError
    > = yield* Cache.make<
      HashableMultiaddr.HashableMultiaddr,
      Option.Option<PeerId>,
      TransportError
    >({
      capacity: config?.dns?.cacheCapacity ?? 32,
      timeToLive: config?.dns?.cacheTimeToLive ?? 5 * 60 * 1000,
      // eslint-disable-next-line @typescript-eslint/no-use-before-define -- this is fine, because we're using it only after it's defined, as the cache accesses the transport
      lookup: (address) => lookupPeer(transport, address),
    });

    const acquire = Effect.tryPromise({
      try: () =>
        createLibp2p({
          logger,
          transports: [tcp(config?.tcp)],
          streamMuxers: [yamux(config?.yamux)],
          connectionEncrypters: [noise(config?.noise)],
          services: {
            identify: identify(),
            // The timeout is a bit deceptive here, we cannot set the timeout too low, as is the combination of:
            // ping interval + ping timeout. The ping interval is 15s and timeout is 20s on the server side,
            // meaning that the total timeout waiting is 35s, any timeout lower than that will cause the ping to fail occasionally.
            // A timeout of 60s is very conservative and should be enough to cover the ping interval + timeout.
            // (This is due to the fact that the implementation of the ping service has a while true loop, that will keep receiving data, so the timeout is not really a timeout)
            // see: https://github.com/libp2p/js-libp2p/blob/96654117c449603aed5b3c6668da29bdab44cff9/packages/protocol-ping/src/ping.ts#L66
            ping: ping({ timeout: 60 * 1000 }),
            state: () => ({ config: config ?? {}, dns: clientDns, cache }),
          },
          dns: clientDns,
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
