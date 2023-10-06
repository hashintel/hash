import { useMutation } from "@apollo/client";
import {
  extractEntityUuidFromEntityId,
  extractOwnedByIdFromEntityId,
  OwnedById,
} from "@local/hash-subgraph";
import { useRouter } from "next/router";
import { useCallback } from "react";

import {
  CreatePageMutation,
  CreatePageMutationVariables,
} from "../../graphql/api-types.gen";
import { getAccountPagesTree } from "../../graphql/queries/account.queries";
import { createPage } from "../../graphql/queries/page.queries";
import { constructPageRelativeUrl } from "../../lib/routes";

export const useCreatePage = ({
  shortname,
  ownedById,
}: {
  shortname?: string;
  ownedById?: OwnedById;
}) => {
  const router = useRouter();

  const [createPageFn, { loading: createPageLoading }] = useMutation<
    CreatePageMutation,
    CreatePageMutationVariables
  >(createPage, {
    awaitRefetchQueries: true,
    refetchQueries: ({ data }) =>
      data
        ? [
            {
              query: getAccountPagesTree,
              variables: {
                ownedById: extractOwnedByIdFromEntityId(
                  data.createPage.metadata.recordId.entityId,
                ),
              },
            },
          ]
        : [],
  });

  const createUntitledPage = useCallback(
    async (prevIndex: string | null) => {
      if (!ownedById) {
        throw new Error("No ownedById provided to useCreatePage");
      }

      const response = await createPageFn({
        variables: { ownedById, properties: { title: "", prevIndex } },
      });

      const pageEntityId = response.data?.createPage.metadata.recordId.entityId;

      if (pageEntityId && shortname) {
        const pageEntityUuid = extractEntityUuidFromEntityId(pageEntityId);
        return router.push(
          constructPageRelativeUrl({
            workspaceShortname: shortname,
            pageEntityUuid,
          }),
        );
      }
    },
    [createPageFn, ownedById, router, shortname],
  );

  return [createUntitledPage, { loading: createPageLoading }] as const;
};
