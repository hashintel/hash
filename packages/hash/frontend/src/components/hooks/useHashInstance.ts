import { useMemo } from "react";
import { useQuery } from "@apollo/client";
import { types } from "@hashintel/hash-shared/types";
import { extractBaseUri } from "@blockprotocol/type-system-web";
import {
  GetHashInstanceEntityQueryQuery,
  GetHashInstanceEntityQueryQueryVariables,
} from "../../graphql/apiTypes.gen";
import { useInitTypeSystem } from "../../lib/use-init-type-system";
import { getHashInstanceEntityQuery } from "../../graphql/queries/knowledge/hashInstance.queries";

type HashInstance = {
  userCreationIsEnabled: boolean;
  orgCreationIsEnabled: boolean;
};

/**
 * Retrieves the HASH instance.
 */
export const useHashInstance = (): {
  loading: boolean;
  hashInstance?: HashInstance;
} => {
  /**
   * @todo: use aggregate entity query instead so that all entities don't have to
   * be fetched to get the HASH instance entity.
   */
  const { data, loading } = useQuery<
    GetHashInstanceEntityQueryQuery,
    GetHashInstanceEntityQueryQueryVariables
  >(getHashInstanceEntityQuery, {
    /** @todo reconsider caching. This is done for testing/demo purposes. */
    fetchPolicy: "no-cache",
  });

  const loadingTypeSystem = useInitTypeSystem();

  const { hashInstanceEntity } = data ?? {};

  const hashInstance = useMemo<HashInstance | undefined>(() => {
    if (!hashInstanceEntity || loadingTypeSystem) {
      return undefined;
    }

    const { properties } = hashInstanceEntity;

    const userCreationIsEnabled = properties[
      extractBaseUri(types.propertyType.userCreationIsEnabled.propertyTypeId)
    ] as boolean;

    const orgCreationIsEnabled = properties[
      extractBaseUri(types.propertyType.orgCreationIsEnabled.propertyTypeId)
    ] as boolean;

    return {
      userCreationIsEnabled,
      orgCreationIsEnabled,
    };
  }, [hashInstanceEntity, loadingTypeSystem]);

  return {
    loading,
    hashInstance,
  };
};
