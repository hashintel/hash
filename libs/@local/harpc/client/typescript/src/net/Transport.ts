import type { DNS } from "@multiformats/dns";

import type { NoiseConfig, TCPConfig, YamuxConfig } from "./Config.js";
import type * as internal from "./internal/transport.js";

export { InitializationError, TransportError } from "./internal/transport.js";
export { type Multiaddr, multiaddr } from "@multiformats/multiaddr";

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
   * @defaultValue 32
   */
  maxRecursiveDepth?: number;

  /**
   * Amount of cached resolved multiaddrs to keep in memory.
   *
   * @defaultValue 32
   */
  cacheCapacity?: number;

  /**
   * Time in milliseconds until a cached resolved multiaddr is considered stale.
   *
   * @defaultValue 5 minutes
   */
  cacheTimeToLive?: number;
}

export interface TransportConfig {
  dns?: DNSConfig;
  tcp?: TCPConfig;
  yamux?: YamuxConfig;
  noise?: NoiseConfig;
}
