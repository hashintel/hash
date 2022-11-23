import { useMemo } from "react";
import { useQuery } from "@apollo/client";
import { types } from "@hashintel/hash-shared/types";
import { extractBaseUri } from "@blockprotocol/type-system-web";
import {
  GetHashInstanceEntityQueryQuery,
  GetHashInstanceEntityQueryQueryVariables,
} from "../../graphql/apiTypes.gen";
import { useInitTypeSystem } from "../../lib/use-init-type-system";
import { HashInstance } from "../../lib/hashInstance";
import { getHashInstanceEntityQuery } from "../../graphql/queries/knowledge/hashInstance.queries";

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

    const userRegistrationIsEnabled = properties[
      extractBaseUri(
        types.propertyType.userRegistrationIsEnabled.propertyTypeId,
      )
    ] as boolean;

    return {
      userRegistrationIsEnabled,
    };
  }, [hashInstanceEntity, loadingTypeSystem]);

  return {
    loading,
    hashInstance,
  };
};
