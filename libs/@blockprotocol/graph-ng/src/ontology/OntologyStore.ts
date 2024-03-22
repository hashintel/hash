import * as DataTypeUrl from "./DataTypeUrl.js";
import { Effect, Cache, Duration } from "effect";
import * as DataType from "./DataType.js";
import * as PropertyType from "./PropertyType.js";
import * as PropertyTypeUrl from "./PropertyTypeUrl.js";
import * as Json from "../Json.js";

export interface OntologyStore<E = unknown, R = never> {
  dataType(
    url: DataTypeUrl.DataTypeUrl,
  ): Effect.Effect<DataType.DataType<unknown>, E, R>;

  // This might overconstrain the `In` value, then again each PropertyType **must**
  // be able to decode from a `Json.Value`.
  propertyType(
    url: PropertyTypeUrl.PropertyTypeUrl,
  ): Effect.Effect<PropertyType.PropertyType<unknown, Json.Value>, E, R>;
}

export const CachedOntologyStore = <E, R>(inner: OntologyStore<E, R>) =>
  Effect.gen(function* (_) {
    const dataTypeCache = yield* _(
      Cache.make({
        capacity: 64,
        timeToLive: Duration.infinity,
        lookup: (key: DataTypeUrl.DataTypeUrl) => inner.dataType(key),
      }),
    );

    const propertyTypeCache = yield* _(
      Cache.make({
        capacity: 64,
        timeToLive: Duration.infinity,
        lookup: (key: PropertyTypeUrl.PropertyTypeUrl) =>
          inner.propertyType(key),
      }),
    );

    return {
      dataType: (url: DataTypeUrl.DataTypeUrl) => dataTypeCache.get(url),
      propertyType: (url: PropertyTypeUrl.PropertyTypeUrl) =>
        propertyTypeCache.get(url),
    } satisfies OntologyStore<E, R>;
  });
