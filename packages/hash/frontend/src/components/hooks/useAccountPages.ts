import { useQuery } from "@apollo/client";
import { EntityId } from "@hashintel/hash-subgraph";
import { useMemo } from "react";

import {
  GetAccountPagesTreeQuery,
  GetAccountPagesTreeQueryVariables,
} from "../../graphql/apiTypes.gen";
import { getAccountPagesTree } from "../../graphql/queries/account.queries";

export type AccountPage = {
  title: string;
  entityId: EntityId;
  parentPageEntityId?: EntityId | null;
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

    return data.pages.map(
      ({
        metadata: {
          editionId: { baseId: pageEntityId },
        },
        parentPage,
        title,
        index,
      }): AccountPage => {
        const parentPageEntityId =
          parentPage?.metadata.editionId.baseId ?? null;

        return {
          entityId: pageEntityId,
          parentPageEntityId,
          title,
          index: index ?? "",
        };
      },
    );
  }, [data]);

  return { data: accountPages, loading };
};
