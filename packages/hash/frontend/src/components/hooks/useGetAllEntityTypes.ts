import { useQuery } from "@apollo/client";
import {
  DeprecatedGetAccountEntityTypesQuery,
  DeprecatedGetAccountEntityTypesQueryVariables,
} from "../../graphql/apiTypes.gen";
import { deprecatedGetAccountEntityTypes } from "../../graphql/queries/account.queries";

/**
 * @todo consolidate this and useBlockProtocolAggregateEntityTypes
 */
export const useGetAllEntityTypes = (accountId: string) => {
  const { data } = useQuery<
    DeprecatedGetAccountEntityTypesQuery,
    DeprecatedGetAccountEntityTypesQueryVariables
  >(deprecatedGetAccountEntityTypes, {
    variables: {
      accountId,
      includeAllTypes: true,
    },
    fetchPolicy: "network-only", // @todo sort out updating cache for entity type lists
  });

  return { data };
};
