import { MutableRef } from "effect";

import * as Json from "../../Json.js";
import { OntologyStore } from "../OntologyStore.js";
import { PropertyType } from "../PropertyType.js";

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

export function hydrate<T, R>(
  context: DecodeContext<T, R>,
  ref: PropertyType<unknown, Json.Value>,
) {
  MutableRef.set(context.type, ref);
}
