import { type Context, Effect, type LogLevel } from "effect";

import { createProto } from "../utils.js";
import * as internal from "./internal/networkLogger.js";

import type { ComponentLogger, Logger } from "@libp2p/interface";

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

  readonly context: Context.Context<never>;

  logger: (
    name: string,
    level: LogLevel.Severity,
  ) => (formatter: unknown, ...args: readonly unknown[]) => void;
}

const NetworkLoggerProto: Omit<NetworkLoggerImpl, "formatters" | "context"> = {
  [TypeId]: TypeId,

  logger(this: NetworkLoggerImpl, name: string, level: LogLevel.Severity) {
    const fork = Effect.runForkWith(this.context);

    return (formatter: unknown, ...args: readonly unknown[]) => {
      const effect = internal
        .format(this.formatters, level, formatter, args)
        .pipe(Effect.withSpan(name));

      fork(effect);
    };
  },

  forComponent(this: NetworkLoggerImpl, name: string): Logger {
    return Object.assign(this.logger(name, "Debug"), {
      error: this.logger(name, "Error"),
      trace: this.logger(name, "Trace"),
      newScope: (child: string) => this.forComponent(`${name}:${child}`),
      enabled: true,
    });
  },
};

export const DefaultFormatters = internal.defaultFormatters;

export const make = Effect.fn("make")(function* (
  formatters?: FormatterCollection,
) {
  const context = yield* Effect.context();

  return createProto(NetworkLoggerProto, {
    formatters: formatters ?? DefaultFormatters,
    context,
  }) satisfies NetworkLoggerImpl;
});
