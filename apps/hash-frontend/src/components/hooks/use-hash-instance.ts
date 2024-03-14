import { useQuery } from "@apollo/client";
import type { Simplified } from "@local/hash-isomorphic-utils/simplify-properties";
import { simplifyProperties } from "@local/hash-isomorphic-utils/simplify-properties";
import type {
  HASHInstance,
  HASHInstanceProperties,
} from "@local/hash-isomorphic-utils/system-types/hashinstance";
import { useMemo } from "react";

import type {
  GetHashInstanceEntityQueryQuery,
  GetHashInstanceEntityQueryQueryVariables,
} from "../../graphql/api-types.gen";
import { getHashInstanceEntityQuery } from "../../graphql/queries/knowledge/hash-instance.queries";

/**
 * Retrieves the HASH instance.
 */
export const useHashInstance = (): {
  loading: boolean;
  hashInstance?: Simplified<HASHInstance>;
} => {
  const { data, loading } = useQuery<
    GetHashInstanceEntityQueryQuery,
    GetHashInstanceEntityQueryQueryVariables
  >(getHashInstanceEntityQuery, {
    fetchPolicy: "cache-and-network",
  });

  const { hashInstanceEntity } = data ?? {};

  const hashInstance = useMemo<Simplified<HASHInstance> | undefined>(() => {
    if (!hashInstanceEntity) {
      return undefined;
    }

    return {
      ...hashInstanceEntity,
      properties: simplifyProperties(
        hashInstanceEntity.properties as HASHInstanceProperties,
      ),
    };
  }, [hashInstanceEntity]);

  return {
    loading,
    hashInstance,
  };
};
