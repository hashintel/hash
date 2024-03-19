import { Effect, Exit, pipe, Option, Cause } from "effect";

export const runError = <T, E>(effect: Effect.Effect<T, E>): Cause.Cause<E> =>
  pipe(
    Effect.runSyncExit(effect), //
    Exit.causeOption,
    Option.getOrThrow,
  );
