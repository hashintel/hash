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
  index: string;
};

export type AccountPagesInfo = {
  data: AccountPage[];
  loading: boolean;
};

export const useAccountPages = (ownedById: string): AccountPagesInfo => {
  const { data, loading } = useQuery<
    GetAccountPagesTreeQuery,
    GetAccountPagesTreeQueryVariables
  >(getAccountPagesTree, {
    variables: { ownedById },
  });

  const accountPages = useMemo(() => {
    if (!data) {
      return [];
    }

    return data?.knowledgePages.map(
      ({ entityId, parentPage, title, index }) => {
        const parentPageEntityId = parentPage?.entityId ?? null;

        return {
          entityId,
          parentPageEntityId,
          title,
          index: index ?? "",
        };
      },
    );
  }, [data]);

  return { data: accountPages, loading };
};
