import type { ComponentLogger, Logger } from "@libp2p/interface";
import type { Option } from "effect";
import { Effect, LogLevel, Runtime } from "effect";
import type { ReadonlyRecord } from "effect/Record";

import { createProto } from "../utils.js";
import * as internal from "./internal/networkLogger.js";

const TypeId: unique symbol = Symbol("@local/harpc-client/net/Logger");
export type TypeId = typeof TypeId;

interface NetworkLogger extends ComponentLogger {
  readonly [TypeId]: TypeId;
  readonly formatters: ReadonlyRecord<
    string,
    (value: unknown) => Option.Option<string>
  >;
}

const NetworkLoggerProto: Omit<NetworkLogger, "formatters" | "forComponent"> = {
  [TypeId]: TypeId,
};

export type Formatter = internal.Formatter;
export const DefaultFormatters = internal.defaultFormatters;

const makeLogger = (
  self: NetworkLogger,
  runtime: Runtime.Runtime<never>,
  level: LogLevel.LogLevel,
  name: string,
) => {
  const fork = Runtime.runFork(runtime);

  return (formatter: unknown, ...args: ReadonlyArray<unknown>) => {
    const effect = internal
      .format(self.formatters, level, formatter, args)
      .pipe(Effect.withSpan(name));

    fork(effect);
  };
};

export const make = (
  runtime: Runtime.Runtime<never>,
  formatters?: ReadonlyRecord<string, Formatter>,
): NetworkLogger =>
  createProto(NetworkLoggerProto, {
    formatters: formatters ?? internal.defaultFormatters,
    forComponent(this: NetworkLogger, name: string): Logger {
      return Object.assign(makeLogger(this, runtime, LogLevel.Debug, name), {
        error: makeLogger(this, runtime, LogLevel.Error, name),
        trace: makeLogger(this, runtime, LogLevel.Trace, name),
        enabled: true,
      });
    },
  });
