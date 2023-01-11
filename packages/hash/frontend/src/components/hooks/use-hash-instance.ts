import { useQuery } from "@apollo/client";
import { extractBaseUri } from "@blockprotocol/type-system";
import { types } from "@hashintel/hash-shared/ontology-types";
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

  const { hashInstanceEntity } = data ?? {};

  const hashInstance = useMemo<HashInstance | undefined>(() => {
    if (!hashInstanceEntity) {
      return undefined;
    }

    const { properties } = hashInstanceEntity;

    const userSelfRegistrationIsEnabled = properties[
      extractBaseUri(
        types.propertyType.userSelfRegistrationIsEnabled.propertyTypeId,
      )
    ] as boolean;

    const orgSelfRegistrationIsEnabled = properties[
      extractBaseUri(
        types.propertyType.orgSelfRegistrationIsEnabled.propertyTypeId,
      )
    ] as boolean;

    const userRegistrationByInviteIsEnabled = properties[
      extractBaseUri(
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
