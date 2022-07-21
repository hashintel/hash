import { useQuery } from "@apollo/client";
import {
  GetAccountEntityTypesQuery,
  GetAccountEntityTypesQueryVariables,
} from "../../graphql/apiTypes.gen";
import { getAccountEntityTypes } from "../../graphql/queries/account.queries";

/**
 * @todo consolidate this and useBlockProtocolAggregateEntityTypes
 */
export const useGetAllEntityTypes = (accountId: string) => {
  const { data } = useQuery<
    GetAccountEntityTypesQuery,
    GetAccountEntityTypesQueryVariables
  >(getAccountEntityTypes, {
    variables: {
      accountId,
      includeAllTypes: true,
    },
    fetchPolicy: "network-only", // @todo sort out updating cache for entity type lists
  });

  return { data };
};
