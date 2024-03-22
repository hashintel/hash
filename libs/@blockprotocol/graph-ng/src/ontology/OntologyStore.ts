import { Cache, Duration, Effect } from "effect";

import * as DataType from "./DataType.js";
import * as DataTypeUrl from "./DataTypeUrl.js";
import * as PropertyType from "./PropertyType.js";
import * as PropertyTypeUrl from "./PropertyTypeUrl.js";

export interface OntologyStore<E = unknown, R = never> {
  dataType(
    url: DataTypeUrl.DataTypeUrl,
  ): Effect.Effect<DataType.DataType<unknown>, E, R>;

  propertyType(
    url: PropertyTypeUrl.PropertyTypeUrl,
  ): Effect.Effect<PropertyType.PropertyType<unknown>, E, R>;
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
