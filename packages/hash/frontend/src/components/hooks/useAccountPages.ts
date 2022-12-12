import { useQuery } from "@apollo/client";
import { EntityId } from "@hashintel/hash-subgraph";
import { useMemo } from "react";

import {
  GetAccountPagesTreeQuery,
  GetAccountPagesTreeQueryVariables,
} from "../../graphql/apiTypes.gen";
import { getAccountPagesTree } from "../../graphql/queries/account.queries";
import { useOrgs } from "./useOrgs";
import { useUsers } from "./useUsers";

export type AccountPage = {
  title: string;
  entityId: EntityId;
  ownerShortname: string;
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

  const { users } = useUsers();
  const { orgs } = useOrgs();

  const ownerShortname = useMemo(
    () =>
      (
        orgs?.find(({ orgAccountId }) => orgAccountId === ownedById) ??
        users?.find(({ userAccountId }) => userAccountId === ownedById)
      )?.shortname,
    [users, orgs, ownedById],
  );

  const accountPages = useMemo(() => {
    if (!data || !ownerShortname) {
      return [];
    }

    return data?.pages.map(
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
          ownerShortname,
          index: index ?? "",
        };
      },
    );
  }, [data, ownerShortname]);

  return { data: accountPages, loading };
};
