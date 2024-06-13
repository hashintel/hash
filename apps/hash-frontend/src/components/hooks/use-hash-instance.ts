import { useQuery } from "@apollo/client";
import { Entity } from "@local/hash-graph-sdk/entity";
import type { Simplified } from "@local/hash-isomorphic-utils/simplify-properties";
import { simplifyProperties } from "@local/hash-isomorphic-utils/simplify-properties";
import type {
  HASHInstance,
  HASHInstanceProperties,
} from "@local/hash-isomorphic-utils/system-types/hashinstance";
import { useMemo } from "react";

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
  hashInstance?: Simplified<HASHInstance>;
  isUserAdmin: boolean;
} => {
  const { data, loading } = useQuery<
    GetHashInstanceSettingsQueryQuery,
    GetHashInstanceSettingsQueryQueryVariables
  >(getHashInstanceSettings, {
    fetchPolicy: "cache-and-network",
  });

  const { hashInstanceSettings } = data ?? {};

  const hashInstance = useMemo<Simplified<HASHInstance> | undefined>(() => {
    if (!hashInstanceSettings) {
      return undefined;
    }

    const deserializedHashInstanceEntity = new Entity<HASHInstanceProperties>(
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
    isUserAdmin: !!hashInstanceSettings?.isUserAdmin,
  };
};
