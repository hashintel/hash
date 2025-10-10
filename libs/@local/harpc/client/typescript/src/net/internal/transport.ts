import { noise } from "@chainsafe/libp2p-noise";
import { yamux } from "@chainsafe/libp2p-yamux";
import { type Identify, identify } from "@libp2p/identify";
import { isPeerId, type PeerId } from "@libp2p/interface";
import { type Ping, ping } from "@libp2p/ping";
import { tcp } from "@libp2p/tcp";
import { type DNS, dns as defaultDns } from "@multiformats/dns";
import {
  multiaddr as makeMultiaddr,
  protocols as getProtocol,
  resolvers as multiaddrResolvers,
} from "@multiformats/multiaddr";
import {
  Array,
  Cache,
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
  Struct,
} from "effect";
import type { NonEmptyArray } from "effect/Array";
import { type Libp2p, createLibp2p } from "libp2p";

import * as NetworkLogger from "../NetworkLogger.js";
import type { DNSConfig, Multiaddr, TransportConfig } from "../Transport.js";

import * as Dns from "./dns.js";
import * as HashableMultiaddr from "./multiaddr.js";
import * as PeerConnection from "./peerConnection.js";

interface TransportState {
  config: TransportConfig;
  dns: DNS;
  cache: Cache.Cache<
    HashableMultiaddr.HashableMultiaddr,
    Option.Option<PeerId>,
    TransportError
  >;
}

/** @internal */
export type Transport = Libp2p<{
  identify: Identify;
  ping: Ping;
  state: TransportState;
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
export class InitializationError extends Data.TaggedError(
  "InitializationError",
)<{ cause: unknown }> {
  get message() {
    return "Failed to initialize client";
  }
}

const DNS_PROTOCOL = getProtocol("dns");
const DNS4_PROTOCOL = getProtocol("dns4");
const DNS6_PROTOCOL = getProtocol("dns6");
const DNS_CODES = [DNS_PROTOCOL.code, DNS4_PROTOCOL.code, DNS6_PROTOCOL.code];

const IPV4_PROTOCOL = getProtocol("ip4");
const IPV6_PROTOCOL = getProtocol("ip6");

const resolveDnsMultiaddrSegment = Effect.fn("resolveDnsMultiaddrSegment")(
  function* (code: number, value?: string) {
    if (!DNS_CODES.includes(code)) {
      return [[code, value] as const];
    }

    if (value === undefined) {
      yield* Effect.logWarning(
        "domain of dns segment is undefined, skipping",
      ).pipe(Effect.annotateLogs({ code, value }));

      return [[code, value] as const];
    }

    const hostname = value;
    const types: Dns.RecordType[] = [];

    if (code === DNS_PROTOCOL.code || code === DNS4_PROTOCOL.code) {
      types.push("A");
    }

    if (code === DNS_PROTOCOL.code || code === DNS6_PROTOCOL.code) {
      types.push("AAAA");
    }

    const records = yield* Dns.lookup(hostname, {
      records: types as NonEmptyArray<Dns.RecordType>,
    }).pipe(Effect.mapError((cause) => new TransportError({ cause })));

    return pipe(
      records,
      Array.filterMap(
        Match.type<Dns.DnsRecord>().pipe(
          Match.when(
            { type: "A" },
            ({ address }) => [IPV4_PROTOCOL.code, address] as const,
          ),
          Match.when(
            { type: "AAAA" },
            ({ address }) => [IPV6_PROTOCOL.code, address] as const,
          ),
          Match.option,
        ),
      ),
    );
  },
);

/**
 * Resolve DNS addresses in a multiaddr (excluding DNSADDR).
 *
 * @internal
 */
const resolveDnsMultiaddr = Effect.fn("resolveDnsMultiaddr")(
  (multiaddr: Multiaddr) =>
    pipe(
      Stream.fromIterable(multiaddr.stringTuples()),
      Stream.mapEffect(Function.tupled(resolveDnsMultiaddrSegment), {
        concurrency: "unbounded",
      }),
      Stream.runFold(
        [] as (number | string | undefined)[][],
        (accumulator, segments) => {
          // we basically have a fan out approach here, meaning that if our output is:
          // ["ip4", "127.0.0.1"], [["ip4", "192.168.178.1"], ["ip6", "2001:0db8:85a3:0000:0000:8a2e:0370:7334"]] [["tcp", "4002"]]
          // the result will be:
          // ["ip4", "127.0.0.1", "ip4", "192.168.178.1", "tcp", "4002"]
          // ["ip4", "127.0.0.1", "ip6", "2001:0db8:85a3:0000:0000:8a2e:0370:7334", "tcp", "4002"]
          // This is also known as a cartesian product
          if (accumulator.length === 0) {
            return Array.map(segments, (segment) => [...segment]);
          }

          return Array.cartesianWith(accumulator, segments, (a, b) => [
            ...a,
            ...b,
          ]);
        },
      ),
      Effect.map(
        Array.map(
          flow(
            Array.filter(Predicate.isNotUndefined),
            Array.map((part) =>
              Predicate.isNumber(part) ? getProtocol(part).name : part,
            ),
            Array.map((part) => `/${part}`),
            Array.join(""),
            makeMultiaddr,
          ),
        ),
      ),
      Effect.tap((resolved) =>
        Effect.logDebug("resolved DNS multiaddr").pipe(
          Effect.annotateLogs({
            multiaddr: multiaddr.toString(),
            resolved,
          }),
        ),
      ),
    ),
);

/**
 * Recursively resolve DNSADDR multiaddrs.
 *
 * Adapted from: https://github.com/libp2p/js-libp2p/blob/92f9acbc1d2aa7b1bb5a8e460e4e0b5770f4455c/packages/libp2p/src/connection-manager/utils.ts#L9.
 */
const resolveDnsaddrMultiaddr = Effect.fn("resolveDnsaddrMultiaddr")(function* (
  multiaddr: Multiaddr,
  options: DNSConfig,
) {
  // check multiaddr resolvers
  const resolvable = Iterable.some(multiaddrResolvers.keys(), (key) =>
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

  yield* Effect.logDebug("resolved DNSADDR multiaddr").pipe(
    Effect.annotateLogs({
      multiaddr: multiaddr.toString(),
      resolved: resolved.map((address) => address.toString()),
    }),
  );

  return resolved;
});

const resolveMultiaddr = Effect.fn("resolveMultiaddr")(
  (transport: Transport, address: Multiaddr) =>
    pipe(
      resolveDnsaddrMultiaddr(address, {
        resolver: transport.services.state.dns,
        maxRecursiveDepth:
          transport.services.state.config.dns?.maxRecursiveDepth,
      }),
      Stream.fromIterableEffect,
      Stream.flatMap((multiaddr) => resolveDnsMultiaddr(multiaddr), {
        concurrency: "unbounded",
      }),
      Stream.runCollect,
      Effect.map(Chunk.toReadonlyArray),
      Effect.map(Array.flatten),
    ),
);

const lookupPeer = Effect.fn("lookupPeer")(function* (
  transport: Transport,
  address: Multiaddr,
) {
  const resolved = yield* resolveMultiaddr(transport, address);

  const peers = yield* Effect.tryPromise({
    try: () => transport.peerStore.all(),
    catch: (cause) => new TransportError({ cause }),
  });

  const addressesByPeer = pipe(
    peers,
    Array.map((peer) => ({
      id: peer.id,
      addresses: peer.addresses.map(Struct.get("multiaddr")),
    })),
  );

  const matchingPeers = pipe(
    addressesByPeer,
    Array.filter(
      flow(
        Struct.get("addresses"),
        Array.intersectionWith<Multiaddr>((a, b) => a.equals(b))(resolved),
        Array.isNonEmptyArray,
      ),
    ),
  );

  yield* Effect.logTrace("discovered peers").pipe(
    Effect.annotateLogs({
      known: addressesByPeer,
      match: matchingPeers,
      resolved,
    }),
  );

  return pipe(
    matchingPeers, //
    Array.map(Struct.get("id")),
    Array.head,
  );
});

const resolvePeer = Effect.fn("resolvePeer")(function* (
  cache: Cache.Cache<
    HashableMultiaddr.HashableMultiaddr,
    Option.Option<PeerId>,
    TransportError
  >,
  address: Address,
) {
  if (isPeerId(address)) {
    return Option.some(address);
  }

  const key = HashableMultiaddr.make(address);
  const peerIdEither = yield* cache.getEither(key);

  if (Either.isLeft(peerIdEither)) {
    yield* Effect.logTrace("retrieved PeerID from cache");
  } else {
    yield* Effect.logTrace("resolved and matched multiaddr to PeerID");
  }

  const peerId = Either.merge(peerIdEither);

  if (Option.isNone(peerId)) {
    yield* Effect.logDebug("PeerID lookup failed, invalidating cache entry");

    yield* cache.invalidate(key);
  }

  return peerId;
});

/** @internal */
export const connect = Effect.fn("connect")(function* (
  transport: Transport,
  address: Address,
) {
  const peerId = yield* resolvePeer(transport.services.state.cache, address);

  if (Option.isSome(peerId)) {
    yield* Effect.logTrace(
      "peer has been dialed before, attempting to reuse connection",
    ).pipe(Effect.annotateLogs({ peerId: peerId.value, address }));

    // we may have an existing connection
    const existingConnection = pipe(
      transport.getConnections(peerId.value),
      Array.head,
      Option.map(PeerConnection.make),
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

  // We resolve the address ourselves before using it, due to how libp2p handles DNS queries:
  //
  // 1. libp2p forwards DNS addresses directly to NodeJS for TCP stream creation,
  //    without pre-resolving them.
  //
  // 2. This works fine in most cases, but causes issues when a proxy is involved:
  //    - The reported remote address becomes the final remote address, with any proxying resolved
  //    - This address may not be directly addressable
  //    - It may differ from the original DNS query result
  //
  // 3. This creates problems when matching addresses to peers:
  //    - libp2p only reports the final remote address
  //    - It doesn't provide the original DNS query result
  //
  // 4. In proxy environments (e.g., AWS), this leads to consistent cache misses
  //    when trying to match addresses to peers.
  let resolved: Multiaddr[] | PeerId;

  if (isPeerId(address)) {
    resolved = address;
  } else {
    resolved = yield* resolveMultiaddr(transport, address);
  }

  const connection = yield* Effect.tryPromise({
    try: (abort) => transport.dial(resolved, { signal: abort, force: true }),
    catch: (cause) => new TransportError({ cause }),
  }).pipe(Effect.map(PeerConnection.make));

  // We already try to lookup the peer ID before dialing, if it doesn't exist in libp2p, associate the resolved address with the peer ID we just dialed,
  // this means that the next time we dial the same peer, we can reuse the connection.
  if (!isPeerId(address)) {
    yield* transport.services.state.cache.set(
      HashableMultiaddr.make(address),
      Option.some(connection.remotePeer),
    );
  }

  if (!isPeerId(resolved)) {
    for (const resolvedAddress of resolved) {
      yield* transport.services.state.cache.set(
        HashableMultiaddr.make(resolvedAddress),
        Option.some(connection.remotePeer),
      );
    }
  }

  return connection;
});

/** @internal */
export const make = Effect.fn("make")(function* (config?: TransportConfig) {
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
          state: () => ({
            config: config ?? {},
            dns: clientDns,
            cache,
          }),
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
