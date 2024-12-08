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

export interface TransportConfig {
  tcp?: TCPConfig;
  yamux?: YamuxConfig;
  noise?: NoiseConfig;
}
