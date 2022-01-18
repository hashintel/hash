import { useQuery } from "@apollo/client";
import {
  GetAccountEntityTypesQuery,
  GetAccountEntityTypesQueryVariables,
} from "../../graphql/apiTypes.gen";
import { getAccountEntityTypes } from "../../graphql/queries/account.queries";

export const useAccountEntityTypes = (
  accountId: string,
  includeOtherTypesInUse?: boolean,
) => {
  const { data } = useQuery<
    GetAccountEntityTypesQuery,
    GetAccountEntityTypesQueryVariables
  >(getAccountEntityTypes, {
    variables: {
      accountId,
      includeOtherTypesInUse: includeOtherTypesInUse ?? false,
    },
  });

  return { data };
};
