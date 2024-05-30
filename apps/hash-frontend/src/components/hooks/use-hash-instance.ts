import { useQuery } from "@apollo/client";
import type { SimpleEntity } from "@local/hash-graph-types/entity";
import type { SimpleProperties } from "@local/hash-isomorphic-utils/simplify-properties";
import { simplifyProperties } from "@local/hash-isomorphic-utils/simplify-properties";
import type { HASHInstanceProperties } from "@local/hash-isomorphic-utils/system-types/hashinstance";
import { useMemo } from "react";

import type {
  GetHashInstanceEntityQueryQuery,
  GetHashInstanceEntityQueryQueryVariables,
} from "../../graphql/api-types.gen";
import { getHashInstanceEntityQuery } from "../../graphql/queries/knowledge/hash-instance.queries";

type SimplifiedHASHInstance = SimpleEntity<
  SimpleProperties<HASHInstanceProperties>
>;

/**
 * Retrieves the HASH instance.
 */
export const useHashInstance = (): {
  loading: boolean;
  hashInstance?: SimplifiedHASHInstance;
} => {
  const { data, loading } = useQuery<
    GetHashInstanceEntityQueryQuery,
    GetHashInstanceEntityQueryQueryVariables
  >(getHashInstanceEntityQuery, {
    fetchPolicy: "cache-and-network",
  });

  const { hashInstanceEntity } = data ?? {};

  const hashInstance = useMemo<
    | (Omit<SimpleEntity, "properties"> & {
        properties: SimplifiedHASHInstance["properties"];
      })
    | undefined
  >(() => {
    if (!hashInstanceEntity) {
      return undefined;
    }

    return {
      metadata: hashInstanceEntity.metadata,
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
