import { useQuery } from "@apollo/client";
import { OwnedById } from "@local/hash-subgraph";
import { useMemo } from "react";

import {
  GetAccountPagesTreeQuery,
  GetAccountPagesTreeQueryVariables,
} from "../../graphql/api-types.gen";
import { getAccountPagesTree } from "../../graphql/queries/account.queries";
import { useHashInstance } from "./use-hash-instance";

export type AccountPagesInfo = {
  data: GetAccountPagesTreeQuery["pages"];
  lastRootPageIndex: string | null;
  loading: boolean;
};

export const useAccountPages = (
  ownedById?: OwnedById,
  includeArchived?: boolean,
): AccountPagesInfo => {
  const { hashInstance } = useHashInstance();

  const { data, loading } = useQuery<
    GetAccountPagesTreeQuery,
    GetAccountPagesTreeQueryVariables
  >(getAccountPagesTree, {
    variables: { ownedById, includeArchived },
    skip: !ownedById || !hashInstance?.properties.pagesAreEnabled,
  });

  const pages = useMemo(() => {
    return data?.pages ?? [];
  }, [data?.pages]);

  const lastRootPageIndex = useMemo(() => {
    const rootPages = pages
      .filter(({ parentPage }) => !parentPage)
      .map(({ fractionalIndex }) => fractionalIndex)
      .sort();

    return rootPages[rootPages.length - 1] ?? null;
  }, [pages]);

  return { data: pages, lastRootPageIndex, loading };
};
