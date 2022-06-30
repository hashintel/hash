import { useMutation } from "@apollo/client";
import {
  UpdatePageMutation,
  UpdatePageMutationVariables,
} from "@hashintel/hash-shared/graphql/apiTypes.gen";
import {
  getPageInfoQuery,
  updatePage,
} from "@hashintel/hash-shared/queries/page.queries";
import { useRouter } from "next/router";

import { useCallback } from "react";
import { getAccountPages } from "../../graphql/queries/account.queries";

export const useArchivePage = (accountId?: string, pageEntityId?: string) => {
  const router = useRouter();

  const [updatePageFn] = useMutation<
    UpdatePageMutation,
    UpdatePageMutationVariables
  >(updatePage, {
    refetchQueries: () => [
      {
        query: getAccountPages,
        variables: { accountId },
      },
      {
        query: getPageInfoQuery,
        variables: {
          entityId: pageEntityId,
          accountId,
          version: router.query.version,
        },
      },
    ],
  });

  const archivePage = useCallback(async () => {
    if (accountId && pageEntityId) {
      return await updatePageFn({
        variables: {
          accountId,
          entityId: pageEntityId,
          properties: { archived: true },
        },
      });
    }
  }, [updatePageFn, accountId, pageEntityId]);

  const unarchivePage = useCallback(async () => {
    if (accountId && pageEntityId) {
      return await updatePageFn({
        variables: {
          accountId,
          entityId: pageEntityId,
          properties: { archived: false },
        },
      });
    }
  }, [updatePageFn, accountId, pageEntityId]);

  return { archivePage, unarchivePage };
};
