import * as Equivalence from "@effect/schema/Equivalence";
import * as S from "@effect/schema/Schema";

export type Value =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Value }
  | ReadonlyArray<Value>;

export const Value: S.Schema<Value> = S.union(
  S.string,
  S.number,
  S.boolean,
  S.null,
  S.record(
    S.string,
    S.suspend(() => Value),
  ),
  S.array(S.suspend(() => Value)),
);

export const ValueEquivalence = Equivalence.make(Value);
