import { useQuery } from "@apollo/client";
import { useMemo } from "react";

import {
  GetAccountPagesTreeQuery,
  GetAccountPagesTreeQueryVariables,
} from "../../graphql/apiTypes.gen";
import { getAccountPagesTree } from "../../graphql/queries/account.queries";

export const useAccountPages = (accountId: string) => {
  const { data, loading } = useQuery<
    GetAccountPagesTreeQuery,
    GetAccountPagesTreeQueryVariables
  >(getAccountPagesTree, {
    variables: { accountId },
  });

  const accountPages = useMemo(() => {
    if (!data) {
      return [];
    }

    return data?.accountPages.map((page) => ({
      title: page.properties.title,
      entityId: page.entityId,
      parentPageEntityId: page.parentPageEntityId,
    }));
  }, [data]);

  return { data: accountPages, loading };
};
