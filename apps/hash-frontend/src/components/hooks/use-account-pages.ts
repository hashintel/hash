import { useQuery } from "@apollo/client";
import { OwnedById } from "@local/hash-subgraph";
import { useMemo } from "react";

import {
  GetAccountPagesTreeQuery,
  GetAccountPagesTreeQueryVariables,
} from "../../graphql/api-types.gen";
import { getAccountPagesTree } from "../../graphql/queries/account.queries";

export type AccountPagesInfo = {
  data: GetAccountPagesTreeQuery["pages"];
  lastRootPageIndex: string | null;
  loading: boolean;
};

export const useAccountPages = (ownedById: OwnedById): AccountPagesInfo => {
  const { data, loading } = useQuery<
    GetAccountPagesTreeQuery,
    GetAccountPagesTreeQueryVariables
  >(getAccountPagesTree, {
    variables: { ownedById },
  });

  const pages = useMemo(() => {
    return data?.pages ?? [];
  }, [data?.pages]);

  const lastRootPageIndex = useMemo(() => {
    const rootPages = pages
      .filter(({ parentPage }) => !parentPage)
      .map(({ index }) => index)
      .sort();

    return rootPages[rootPages.length - 1] ?? null;
  }, [pages]);

  return { data: pages, lastRootPageIndex, loading };
};
