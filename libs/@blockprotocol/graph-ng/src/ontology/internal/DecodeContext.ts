import { MutableRef } from "effect";
import { PropertyType } from "../PropertyType.js";
import { OntologyStore } from "../OntologyStore.js";
import * as Json from "../../Json.js";

export interface DecodeContext<T, R = never> {
  readonly root: T;
  readonly type: MutableRef.MutableRef<PropertyType<
    unknown,
    Json.Value
  > | null>;

  readonly store: OntologyStore<unknown, R>;
}

export function make<T, E, R = never>(
  root: T,
  store: OntologyStore<E, R>,
): DecodeContext<T, R> {
  return {
    root,
    type: MutableRef.make(null),

    store,
  };
}

export function hydrate<T>(context: DecodeContext<T>, ref: PropertyType<any>) {
  MutableRef.set(context.type, ref);
}
