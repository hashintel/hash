import dns from "node:dns/promises";
import { isIPv4, isIPv6 } from "node:net";

import {
  Array,
  Cause,
  Data,
  Duration,
  Effect,
  Function,
  pipe,
  Record,
} from "effect";
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

const logEnvironment = (hostname: string) =>
  Effect.gen(function* () {
    const servers = dns.getServers();
    const records = yield* Effect.tryPromise(() =>
      dns.resolveAny(hostname),
    ).pipe(Effect.merge);

    yield* Effect.logTrace("resolved DNS environment").pipe(
      Effect.annotateLogs({ hostname, servers, records }),
    );
  });

const logReverse = (records: DnsRecord[]) =>
  Effect.gen(function* () {
    const reverseRecords = yield* pipe(
      records,
      Array.map((record) =>
        Effect.tryPromise(() => dns.reverse(record.address)).pipe(
          Effect.merge,
          Effect.map((reverse) => [record.address, reverse] as const),
        ),
      ),
      (effects) => Effect.all(effects, { concurrency: "unbounded" }),
      Effect.map(Record.fromEntries),
    );

    yield* Effect.logTrace("queried DNS for hostname").pipe(
      Effect.annotateLogs({ reverse: reverseRecords }),
    );
  });

/** @internal */
export const resolve = (
  hostname: string,
  query: {
    records: NonEmptyReadonlyArray<RecordType>;
  },
) =>
  Effect.gen(function* () {
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
  }).pipe(
    Effect.tap((records) =>
      logReverse(records).pipe(Effect.annotateLogs({ hostname, query })),
    ),
  );
