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
}

interface NetworkLoggerImpl extends NetworkLogger {
  readonly formatters: ReadonlyRecord<
    string,
    (value: unknown) => Option.Option<string>
  >;

  readonly runtime: Runtime.Runtime<never>;

  logger(
    name: string,
    level: LogLevel.LogLevel,
  ): (formatter: unknown, ...args: ReadonlyArray<unknown>) => void;
}

const NetworkLoggerProto: Omit<
  NetworkLoggerImpl,
  "formatters" | "forComponent" | "runtime"
> = {
  [TypeId]: TypeId,

  logger(this: NetworkLoggerImpl, name: string, level: LogLevel.LogLevel) {
    const fork = Runtime.runFork(this.runtime);

    return (formatter: unknown, ...args: ReadonlyArray<unknown>) => {
      const effect = internal
        .format(this.formatters, level, formatter, args)
        .pipe(Effect.withSpan(name));

      fork(effect);
    };
  },
};

export type Formatter = internal.Formatter;
export const DefaultFormatters = internal.defaultFormatters;

export const make = (
  formatters?: ReadonlyRecord<string, Formatter>,
): Effect.Effect<NetworkLogger> =>
  Effect.gen(function* () {
    const runtime = yield* Effect.runtime();

    return createProto(NetworkLoggerProto, {
      formatters: formatters ?? internal.defaultFormatters,
      runtime,
      forComponent(this: NetworkLoggerImpl, name: string): Logger {
        return Object.assign(this.logger(name, LogLevel.Debug), {
          error: this.logger(name, LogLevel.Error),
          trace: this.logger(name, LogLevel.Trace),
          enabled: true,
        });
      },
    }) satisfies NetworkLoggerImpl;
  });
