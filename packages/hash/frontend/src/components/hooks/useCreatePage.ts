import { useMutation } from "@apollo/client";
import { useRouter } from "next/router";
import { useCallback } from "react";
import {
  CreateKnowledgePageMutation,
  CreateKnowledgePageMutationVariables,
} from "../../graphql/apiTypes.gen";
import { getAccountPagesTree } from "../../graphql/queries/account.queries";
import { createKnowledgePage } from "../../graphql/queries/page.queries";

export const useCreatePage = (ownedById: string) => {
  const router = useRouter();

  const [createPageFn, { loading: createPageLoading }] = useMutation<
    CreateKnowledgePageMutation,
    CreateKnowledgePageMutationVariables
  >(createKnowledgePage, {
    awaitRefetchQueries: true,
    refetchQueries: ({ data }) => [
      {
        query: getAccountPagesTree,
        variables: { accountId: data?.createKnowledgePage.accountId },
      },
    ],
  });

  const createUntitledPage = useCallback(
    async (prevIndex: string | null) => {
      const response = await createPageFn({
        variables: { ownedById, properties: { title: "", prevIndex } },
      });

      const { accountId: pageAccountId, entityId: pageEntityId } =
        response.data?.createKnowledgePage ?? {};

      if (pageAccountId && pageEntityId) {
        return router.push(`/${pageAccountId}/${pageEntityId}`);
      }
    },
    [createPageFn, ownedById, router],
  );

  return [createUntitledPage, { loading: createPageLoading }] as const;
};
