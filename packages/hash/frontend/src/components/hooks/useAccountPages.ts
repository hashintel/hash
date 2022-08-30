import { useQuery } from "@apollo/client";
import { useMemo } from "react";

import {
  GetAccountPagesTreeQuery,
  GetAccountPagesTreeQueryVariables,
} from "../../graphql/apiTypes.gen";
import { getAccountPagesTree } from "../../graphql/queries/account.queries";

export type AccountPage = {
  title: string;
  entityId: string;
  parentPageEntityId?: string | null;
};

export type AccountPagesInfo = {
  data: AccountPage[];
  loading: boolean;
};

export const useAccountPages = (accountId: string): AccountPagesInfo => {
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

    return data?.accountPages.map(
      ({ entityId, parentPageEntityId, properties: { title } }) => {
        return {
          entityId,
          parentPageEntityId,
          title,
        };
      },
    );
  }, [data]);

  return { data: accountPages, loading };
};
