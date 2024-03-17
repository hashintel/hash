import * as Equivalence from "@effect/schema/Equivalence";
import * as S from "@effect/schema/Schema";

/** @internal */
const TypeId: unique symbol = Symbol.for("@blockprotocol/graph/Json/Value");
export type TypeId = typeof TypeId;

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
).annotations({ typeId: TypeId });

export const ValueEquivalence = Equivalence.make(Value);
