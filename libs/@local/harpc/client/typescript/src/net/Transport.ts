import type { DNS } from "@multiformats/dns";
import { Data } from "effect";

import type { NoiseConfig, TCPConfig, YamuxConfig } from "./Config.js";
import type * as internal from "./internal/transport.js";

export { TransportError } from "./internal/transport.js";
export { type Multiaddr, multiaddr } from "@multiformats/multiaddr";

export class InitializationError extends Data.TaggedError(
  "InitializationError",
)<{ cause: unknown }> {
  get message() {
    return "Failed to initialize client";
  }
}

export type Address = internal.Address;

export interface DNSConfig {
  /**
   * The DNS resolver to use when resolving DNSADDR Multiaddrs.
   */
  resolver?: DNS;

  /**
   * When resolving DNSADDR Multiaddrs that resolve to other DNSADDR Multiaddrs,
   * limit how many times we will recursively resolve them.
   *
   * @default 32
   */
  maxRecursiveDepth?: number;

  /**
   * Amount of cached resolved multiaddrs to keep in memory.
   *
   * @default 32
   */
  cacheCapacity?: number;

  /**
   * Time in milliseconds until a cached resolved multiaddr is considered stale.
   *
   * @default 5 minutes
   */
  cacheTimeToLive?: number;
}

export interface TransportConfig {
  dns?: DNSConfig;
  tcp?: TCPConfig;
  yamux?: YamuxConfig;
  noise?: NoiseConfig;
}
