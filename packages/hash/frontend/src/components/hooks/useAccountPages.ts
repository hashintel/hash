import { useQuery } from "@apollo/client";

import {
  GetAccountPagesQuery,
  GetAccountPagesQueryVariables,
} from "../../graphql/apiTypes.gen";
import { getAccountPages } from "../../graphql/queries/account.queries";

export const useAccountPages: (accountId: string) => {
  loading: boolean;
  data: GetAccountPagesQuery | undefined;
} = (accountId) => {
  const { data, loading } = useQuery<
    GetAccountPagesQuery,
    GetAccountPagesQueryVariables
  >(getAccountPages, {
    variables: { accountId },
  });

  return { data, loading };
};
