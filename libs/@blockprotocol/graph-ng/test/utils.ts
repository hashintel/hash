import { Cause, Effect, Exit, Option, pipe } from "effect";

export const runError = <T, E>(effect: Effect.Effect<T, E>): Cause.Cause<E> =>
  pipe(
    Effect.runSyncExit(effect), //
    Exit.causeOption,
    Option.getOrThrow,
  );
