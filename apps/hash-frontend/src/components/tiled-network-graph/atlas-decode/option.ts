/** Explicit absence, independent of a computation's success or failure. */
import { dual } from "./function";
import * as Result from "./result";

export interface Some<out T> {
  readonly _tag: "some";
  readonly value: T;
}

export interface None {
  readonly _tag: "none";
}

export type Option<T> = Some<T> | None;

const absent: None = { _tag: "none" };

export const none = (): None => absent;
export const some = <T>(value: T): Some<T> => ({ _tag: "some", value });
export const isSome = <T>(option: Option<T>): option is Some<T> =>
  option._tag === "some";
export const isNone = <T>(option: Option<T>): option is None =>
  option._tag === "none";

/** Converts null and undefined to absence, retaining falsy values and empty views. */
export const fromNullable = <T>(value: T): Option<NonNullable<T>> =>
  value === null || value === undefined ? none() : some(value);

/** Transforms a present value without invoking the callback for absence. */
export const map: {
  <T, U>(transform: (value: T) => U): (option: Option<T>) => Option<U>;
  <T, U>(option: Option<T>, transform: (value: T) => U): Option<U>;
} = dual(
  2,
  <T, U>(option: Option<T>, transform: (value: T) => U): Option<U> =>
    isSome(option) ? some(transform(option.value)) : option,
);

/** Keeps a present value when the predicate holds, narrowing it for a refinement. Absence passes through. */
export const filter: {
  <T, U extends T>(
    refinement: (value: T) => value is U,
  ): <Value extends T>(option: Option<Value>) => Option<Value & U>;
  <T>(
    predicate: (value: T) => boolean,
  ): <Value extends T>(option: Option<Value>) => Option<Value>;
  <T, U extends T>(
    option: Option<T>,
    refinement: (value: T) => value is U,
  ): Option<U>;
  <T>(option: Option<T>, predicate: (value: T) => boolean): Option<T>;
} = dual(
  2,
  <T>(option: Option<T>, predicate: (value: T) => boolean): Option<T> =>
    isSome(option) && !predicate(option.value) ? none() : option,
);

/** Wraps a value as present when the predicate holds, narrowing it for a refinement. */
export const liftPredicate: {
  <T, U extends T>(
    refinement: (value: T) => value is U,
  ): <Value extends T>(value: Value) => Option<Value & U>;
  <T>(
    predicate: (value: T) => boolean,
  ): <Value extends T>(value: Value) => Option<Value>;
  <T, U extends T>(value: T, refinement: (value: T) => value is U): Option<U>;
  <T>(value: T, predicate: (value: T) => boolean): Option<T>;
} = dual(
  2,
  <T>(value: T, predicate: (value: T) => boolean): Option<T> =>
    predicate(value) ? some(value) : none(),
);

/** Evaluates the handler for the selected variant. */
export const match: {
  <T, Present, Absent>(handlers: {
    onSome: (value: T) => Present;
    onNone: () => Absent;
  }): (option: Option<T>) => Present | Absent;
  <T, Present, Absent>(
    option: Option<T>,
    handlers: { onSome: (value: T) => Present; onNone: () => Absent },
  ): Present | Absent;
} = dual(
  2,
  <T, Present, Absent>(
    option: Option<T>,
    { onSome, onNone }: { onSome: (value: T) => Present; onNone: () => Absent },
  ): Present | Absent => (isSome(option) ? onSome(option.value) : onNone()),
);

/** Returns the present value, or evaluates the fallback for absence. */
export const unwrapOrElse: {
  <Fallback>(orElse: () => Fallback): <T>(option: Option<T>) => T | Fallback;
  <T, Fallback>(option: Option<T>, orElse: () => Fallback): T | Fallback;
} = dual(
  2,
  <T, Fallback>(option: Option<T>, orElse: () => Fallback): T | Fallback =>
    isSome(option) ? option.value : orElse(),
);

/** Propagates a present failure and returns absence as success. */
export const transposeResult = <T, E>(
  option: Option<Result.Result<T, E>>,
): Result.Result<Option<T>, E> => {
  if (isNone(option)) {
    return Result.ok(option);
  }

  return Result.isErr(option.value)
    ? Result.err(option.value.error)
    : Result.ok(some(option.value.value));
};
