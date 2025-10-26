import type { ComponentLogger, Logger } from "@libp2p/interface";
import { Effect, LogLevel, Runtime } from "effect";

import { createProto } from "../utils.js";

import * as internal from "./internal/networkLogger.js";

const TypeId: unique symbol = Symbol("@local/harpc-client/net/Logger");

export type TypeId = typeof TypeId;

export type Formatter = internal.Formatter;
export type FormatterSpecifier = internal.FormatterSpecifier;
export type FormatterCollection = internal.FormatterCollection;

interface NetworkLogger extends ComponentLogger {
  readonly [TypeId]: TypeId;
}

interface NetworkLoggerImpl extends NetworkLogger {
  readonly formatters: FormatterCollection;

  readonly runtime: Runtime.Runtime<never>;

  logger: (
    name: string,
    level: LogLevel.LogLevel,
  ) => (formatter: unknown, ...args: readonly unknown[]) => void;
}

const NetworkLoggerProto: Omit<NetworkLoggerImpl, "formatters" | "runtime"> = {
  [TypeId]: TypeId,

  logger(this: NetworkLoggerImpl, name: string, level: LogLevel.LogLevel) {
    const fork = Runtime.runFork(this.runtime);

    return (formatter: unknown, ...args: readonly unknown[]) => {
      const effect = internal
        .format(this.formatters, level, formatter, args)
        .pipe(Effect.withSpan(name));

      fork(effect);
    };
  },

  forComponent(this: NetworkLoggerImpl, name: string): Logger {
    return Object.assign(this.logger(name, LogLevel.Debug), {
      error: this.logger(name, LogLevel.Error),
      trace: this.logger(name, LogLevel.Trace),
      newScope: (child: string) => this.forComponent(`${name}:${child}`),
      enabled: true,
    });
  },
};

export const DefaultFormatters = internal.defaultFormatters;

export const make = Effect.fn("make")(function* (
  formatters?: FormatterCollection,
) {
  const runtime = yield* Effect.runtime();

  return createProto(NetworkLoggerProto, {
    formatters: formatters ?? DefaultFormatters,
    runtime,
  }) satisfies NetworkLoggerImpl;
});
