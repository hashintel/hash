import { useMutation } from "@apollo/client";
import type { OwnedById } from "@local/hash-subgraph";
import {
  extractEntityUuidFromEntityId,
  extractOwnedByIdFromEntityId,
} from "@local/hash-subgraph";
import { useRouter } from "next/router";
import { useCallback } from "react";

import type {
  CreatePageMutation,
  CreatePageMutationVariables,
} from "../../graphql/api-types.gen";
import { PageType } from "../../graphql/api-types.gen";
import { structuralQueryEntitiesQuery } from "../../graphql/queries/knowledge/entity.queries";
import { createPage } from "../../graphql/queries/page.queries";
import { constructPageRelativeUrl } from "../../lib/routes";
import { getAccountPagesVariables } from "../../shared/account-pages-variables";

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
    awaitRefetchQueries: false,
    refetchQueries: ({ data }) =>
      data
        ? [
            {
              query: structuralQueryEntitiesQuery,
              variables: getAccountPagesVariables({
                ownedById: extractOwnedByIdFromEntityId(
                  data.createPage.metadata.recordId.entityId,
                ),
              }),
            },
          ]
        : [],
  });

  const createUntitledPage = useCallback(
    async (prevFractionalIndex: string | null, type: "canvas" | "document") => {
      if (!ownedById) {
        throw new Error("No ownedById provided to useCreatePage");
      }

      const response = await createPageFn({
        variables: {
          ownedById,
          properties: {
            title: "",
            prevFractionalIndex,
            type: type === "canvas" ? PageType.Canvas : PageType.Document,
          },
        },
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
