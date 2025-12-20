import dns from "node:dns/promises";
import { isIPv4, isIPv6 } from "node:net";

import { Array, Cause, Data, Duration, Effect, Function } from "effect";
import type { NonEmptyReadonlyArray } from "effect/Array";

/** @internal */
export class DnsError extends Data.TaggedError("DnsError")<{
  cause: unknown;
}> {
  get message() {
    return "Underlying DNS resolver experienced an error";
  }
}

/** @internal */
export type RecordType = "A" | "AAAA";

/** @internal */
export interface Ipv4AddressRecord {
  type: "A";

  address: string;
  timeToLive: Duration.Duration;
}

/** @internal */
export interface Ipv6AddressRecord {
  type: "AAAA";

  address: string;
  timeToLive: Duration.Duration;
}

/** @internal */
export type DnsRecord = Ipv4AddressRecord | Ipv6AddressRecord;

const resolveA = (hostname: string) =>
  Effect.tryPromise({
    try: () => dns.resolve4(hostname, { ttl: true }),
    catch: (cause) => new DnsError({ cause }),
  }).pipe(
    Effect.map(
      Array.map(
        ({ address, ttl }): Ipv4AddressRecord => ({
          type: "A",

          address,
          timeToLive: Duration.seconds(ttl),
        }),
      ),
    ),
  );

const resolveAAAA = (hostname: string) =>
  Effect.tryPromise({
    try: () => dns.resolve6(hostname, { ttl: true }),
    catch: (cause) => new DnsError({ cause }),
  }).pipe(
    Effect.map(
      Array.map(
        ({ address, ttl }): Ipv6AddressRecord => ({
          type: "AAAA",

          address,
          timeToLive: Duration.seconds(ttl),
        }),
      ),
    ),
  );

const logEnvironment = Effect.fn("logEnvironment")(function* (
  hostname: string,
) {
  const servers = dns.getServers();
  const records = yield* Effect.tryPromise(() => dns.resolveAny(hostname)).pipe(
    Effect.merge,
  );

  yield* Effect.logTrace("resolved DNS environment").pipe(
    Effect.annotateLogs({ hostname, servers, records }),
  );
});

interface Query {
  readonly records: NonEmptyReadonlyArray<RecordType>;
}

/** @internal */
export const resolve = Effect.fn("resolve")(function* (
  hostname: string,
  query: Query,
) {
  const resolvers: Effect.Effect<DnsRecord[], DnsError>[] = [];

  if (query.records.includes("A")) {
    resolvers.push(resolveA(hostname));

    if (isIPv4(hostname)) {
      return [
        {
          type: "A",

          address: hostname,
          timeToLive: Duration.infinity,
        } as DnsRecord,
      ];
    }
  }

  if (query.records.includes("AAAA")) {
    resolvers.push(resolveAAAA(hostname));

    if (isIPv6(hostname)) {
      return [
        {
          type: "AAAA",

          address: hostname,
          timeToLive: Duration.infinity,
        } as DnsRecord,
      ];
    }
  }

  if (resolvers.length === 0) {
    return yield* new DnsError({
      cause: new Error("No record types to resolve"),
    });
  }

  yield* Effect.fork(logEnvironment(hostname));

  const [excluded, satisfying] = yield* Effect.partition(
    resolvers,
    Function.identity,
    {
      concurrency: "unbounded",
    },
  );

  if (satisfying.length === 0) {
    // means that excluded is non empty

    return yield* Effect.failCause(
      // reduce without default is save here, because we guarantee non empty satisfying array
      excluded
        .map(Cause.fail)
        .reduce(Cause.parallel),
    );
  }

  return Array.flatten(satisfying);
});

/** @internal */
export const lookup = Effect.fn("lookup")(function* (
  hostname: string,
  query: Query,
) {
  const records = yield* Effect.tryPromise({
    try: () => dns.lookup(hostname, { all: true }),
    catch: (cause) => new DnsError({ cause }),
  });

  yield* Effect.fork(logEnvironment(hostname));

  // partition into A and AAAA records
  const [excluded, satisfying] = Array.partition(
    records,
    (record) => record.family === 4,
  );

  // we cannot determine the TTL of lookup records, therefore we set it to infinity
  // `getaddrinfo` (the underlying call used by dns.lookup) does not return TTLs
  // to fix this see: https://linear.app/hash/issue/H-3785/create-typescripteffect-dns-package
  const aRecords = satisfying.map(
    (record) =>
      ({
        type: "A",
        address: record.address,
        timeToLive: Duration.infinity,
      }) as DnsRecord,
  );

  const aaaaRecords = excluded.map(
    (record) =>
      ({
        type: "AAAA",
        address: record.address,
        timeToLive: Duration.infinity,
      }) as DnsRecord,
  );

  const output: DnsRecord[] = [];

  if (query.records.includes("A")) {
    output.push(...aRecords);
  }

  if (query.records.includes("AAAA")) {
    output.push(...aaaaRecords);
  }

  return output;
});
