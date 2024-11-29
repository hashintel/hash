import type { ComponentLogger, Logger } from "@libp2p/interface";
import { Effect, LogLevel } from "effect";
import weald from "weald";

const makeDebugger = (level: LogLevel.LogLevel, name: string) => {
  // TODO: this isn't great... there must be a better way
  const logger = weald(name);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  logger.log = (...args: ReadonlyArray<any>) => {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
    void Effect.runPromise(Effect.logWithLevel(level, ...args));
  };

  return logger;
};

export const make = (): ComponentLogger => {
  return {
    forComponent: (name: string): Logger => {
      return Object.assign(makeDebugger(LogLevel.Debug, name), {
        error: makeDebugger(LogLevel.Error, name),
        trace: makeDebugger(LogLevel.Trace, name),
      });
    },
  };
};
