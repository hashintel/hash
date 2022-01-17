import { useQuery } from "@apollo/client";
import { useMemo } from "react";

import {
  GetAccountPagesQuery,
  GetAccountPagesQueryVariables,
} from "../../graphql/apiTypes.gen";
import { getAccountPages } from "../../graphql/queries/account.queries";

export const useAccountPages = (accountId: string) => {
  const { data, loading } = useQuery<
    GetAccountPagesQuery,
    GetAccountPagesQueryVariables
  >(getAccountPages, {
    variables: { accountId },
  });

  const accountPages = useMemo(() => {
    if (!data) {
      return [];
    }

    return data?.accountPages.map((page) => ({
      title: page.properties.title,
      entityId: page.entityId,
    }));
  }, [data]);

  return { data: accountPages, loading };
};
