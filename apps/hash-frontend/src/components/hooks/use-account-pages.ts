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

  return { data: pages, loading };
};
