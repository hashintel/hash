import { Data } from "effect";

import type { NoiseConfig, TCPConfig, YamuxConfig } from "./Config.js";

export class InitializationError extends Data.TaggedError(
  "InitializationError",
)<{ cause: unknown }> {
  get message() {
    return "Failed to initialize client";
  }
}

export interface TransportConfig {
  tcp?: TCPConfig;
  yamux?: YamuxConfig;
  noise?: NoiseConfig;
}
