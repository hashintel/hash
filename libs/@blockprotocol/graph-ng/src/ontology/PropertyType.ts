import * as S from "@effect/schema/Schema";
import { Equal, Hash, Inspectable, pipe, Pipeable, Predicate } from "effect";

import * as Json from "../Json.js";
import * as PropertyTypeUrl from "./PropertyTypeUrl.js";

const TypeId: unique symbol = Symbol.for(
  "@blockprotocol/graph/ontology/PropertyType",
);
export type TypeId = typeof TypeId;

/** @internal */
export const AnnotationId: unique symbol = Symbol.for(
  "@blockprotocol/graph/ontology/PropertyType/Annotation",
);

export interface PropertyType<T>
  extends Equal.Equal,
    Pipeable.Pipeable,
    Inspectable.Inspectable {
  [TypeId]: TypeId;

  readonly id: PropertyTypeUrl.PropertyTypeUrl;
  readonly schema: S.Schema<T, Json.Value>;
}

interface PropertyTypeImpl<T> extends PropertyType<T> {}

const PropertyTypeProto: Omit<PropertyTypeImpl<unknown>, "id" | "schema"> = {
  [TypeId]: TypeId,

  toJSON(this: PropertyTypeImpl<unknown>): unknown {
    return {
      _id: "PropertyType",
      id: this.id,
      schema: this.schema.ast.toJSON(),
    };
  },
  toString(this: PropertyTypeImpl<unknown>): string {
    return Inspectable.format(this.toJSON());
  },
  [Inspectable.NodeInspectSymbol]() {
    return this.toJSON();
  },

  pipe() {
    // eslint-disable-next-line prefer-rest-params
    Pipeable.pipeArguments(this, arguments);
  },

  [Hash.symbol](this: PropertyTypeImpl<unknown>) {
    return pipe(
      Hash.hash(TypeId),
      Hash.combine(Hash.hash(this.id)),
      Hash.cached(this),
    );
  },
  [Equal.symbol]<T>(this: PropertyType<T>, that: unknown): boolean {
    // eslint-disable-next-line @typescript-eslint/no-use-before-define
    if (!isPropertyType(that)) {
      return false;
    }

    return this.id === that.id;
  },
};

export function isPropertyType(value: unknown): value is PropertyType<unknown> {
  return Predicate.hasProperty(value, TypeId);
}

function makeImpl<T>(
  id: PropertyTypeUrl.PropertyTypeUrl,
  schema: S.Schema<T, Json.Value>,
): PropertyType<T> {
  // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
  const impl = Object.create(PropertyTypeProto);
  // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
  impl.id = id;
  // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
  impl.schema = schema.annotations({
    [AnnotationId]: () => impl as PropertyType<unknown>,
  });

  return impl as PropertyType<T>;
}
