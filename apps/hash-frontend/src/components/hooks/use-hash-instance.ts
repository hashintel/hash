import { useQuery } from "@apollo/client";
import { types } from "@local/hash-isomorphic-utils/ontology-types";
import { extractBaseUrl } from "@local/hash-subgraph/type-system-patch";
import { useMemo } from "react";

import {
  GetHashInstanceEntityQueryQuery,
  GetHashInstanceEntityQueryQueryVariables,
} from "../../graphql/api-types.gen";
import { getHashInstanceEntityQuery } from "../../graphql/queries/knowledge/hash-instance.queries";

type HashInstance = {
  userSelfRegistrationIsEnabled: boolean;
  orgSelfRegistrationIsEnabled: boolean;
  userRegistrationByInviteIsEnabled: boolean;
};

/**
 * Retrieves the HASH instance.
 */
export const useHashInstance = (): {
  loading: boolean;
  hashInstance?: HashInstance;
} => {
  /**
   * @todo: use queryEntities instead so that all entities don't have to
   *   be fetched to get the HASH instance entity.
   */
  const { data, loading } = useQuery<
    GetHashInstanceEntityQueryQuery,
    GetHashInstanceEntityQueryQueryVariables
  >(getHashInstanceEntityQuery, {
    /** @todo reconsider caching. This is done for testing/demo purposes. */
    fetchPolicy: "no-cache",
  });

  const { hashInstanceEntity } = data ?? {};

  const hashInstance = useMemo<HashInstance | undefined>(() => {
    if (!hashInstanceEntity) {
      return undefined;
    }

    const { properties } = hashInstanceEntity;

    const userSelfRegistrationIsEnabled = properties[
      extractBaseUrl(
        types.propertyType.userSelfRegistrationIsEnabled.propertyTypeId,
      )
    ] as boolean;

    const orgSelfRegistrationIsEnabled = properties[
      extractBaseUrl(
        types.propertyType.orgSelfRegistrationIsEnabled.propertyTypeId,
      )
    ] as boolean;

    const userRegistrationByInviteIsEnabled = properties[
      extractBaseUrl(
        types.propertyType.userRegistrationByInviteIsEnabled.propertyTypeId,
      )
    ] as boolean;

    return {
      userSelfRegistrationIsEnabled,
      userRegistrationByInviteIsEnabled,
      orgSelfRegistrationIsEnabled,
    };
  }, [hashInstanceEntity]);

  return {
    loading,
    hashInstance,
  };
};
