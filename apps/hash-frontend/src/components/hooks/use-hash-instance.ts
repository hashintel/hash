import { useMemo } from "react";
import { useQuery } from "@apollo/client";
import { Entity } from "@local/hash-graph-sdk/entity";
import type {
  Simplified,
  simplifyProperties,
} from "@local/hash-isomorphic-utils/simplify-properties";
import type { HASHInstance } from "@local/hash-isomorphic-utils/system-types/hashinstance";

import type {
  GetHashInstanceSettingsQueryQuery,
  GetHashInstanceSettingsQueryQueryVariables,
} from "../../graphql/api-types.gen";
import { getHashInstanceSettings } from "../../graphql/queries/knowledge/hash-instance.queries";

/**
 * Retrieves the HASH instance.
 */
export const useHashInstance = (): {
  loading: boolean;
  hashInstance?: Simplified<Entity<HASHInstance>>;
  isUserAdmin: boolean;
} => {
  const { data, loading } = useQuery<
    GetHashInstanceSettingsQueryQuery,
    GetHashInstanceSettingsQueryQueryVariables
  >(getHashInstanceSettings, {
    fetchPolicy: "cache-and-network",
  });

  const { hashInstanceSettings } = data ?? {};

  const hashInstance = useMemo<
    Simplified<Entity<HASHInstance>> | undefined
  >(() => {
    if (!hashInstanceSettings) {
      return undefined;
    }

    const deserializedHashInstanceEntity = new Entity<HASHInstance>(
      hashInstanceSettings.entity,
    );

    return {
      metadata: deserializedHashInstanceEntity.metadata,
      properties: simplifyProperties(deserializedHashInstanceEntity.properties),
    };
  }, [hashInstanceSettings]);

  return {
    loading,
    hashInstance,
    isUserAdmin: Boolean(hashInstanceSettings?.isUserAdmin),
  };
};
