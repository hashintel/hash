import { useMutation } from "@apollo/client";
import {
  EntityId,
  extractEntityUuidFromEntityId,
  OwnedById,
} from "@local/hash-subgraph";
import { useRouter } from "next/router";
import { useCallback } from "react";

import {
  CreatePageMutation,
  CreatePageMutationVariables,
  SetParentPageMutation,
  SetParentPageMutationVariables,
} from "../../graphql/api-types.gen";
import { structuralQueryEntitiesQuery } from "../../graphql/queries/knowledge/entity.queries";
import { createPage, setParentPage } from "../../graphql/queries/page.queries";
import { constructPageRelativeUrl } from "../../lib/routes";
import { getAccountPagesVariables } from "../../shared/account-pages-variables";

export const useCreateSubPage = ({
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
  >(createPage);

  const [setParentPageFn, { loading: setParentPageLoading }] = useMutation<
    SetParentPageMutation,
    SetParentPageMutationVariables
  >(setParentPage, {
    awaitRefetchQueries: true,
    refetchQueries: () => [
      {
        query: structuralQueryEntitiesQuery,
        variables: getAccountPagesVariables({ ownedById }),
      },
    ],
  });

  const createSubPage = useCallback(
    async (
      parentPageEntityId: EntityId,
      prevFractionalIndex: string | null,
    ) => {
      if (!ownedById) {
        throw new Error("No ownedById provided to useCreateSubPage");
      }

      const response = await createPageFn({
        variables: { ownedById, properties: { title: "Untitled" } },
      });

      if (response.data?.createPage) {
        const pageEntityId =
          response.data.createPage.metadata.recordId.entityId;

        await setParentPageFn({
          variables: {
            pageEntityId,
            parentPageEntityId,
            prevFractionalIndex,
          },
        });

        if (
          shortname &&
          // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- @todo improve logic or types to remove this comment
          pageEntityId
        ) {
          const pageEntityUuid = extractEntityUuidFromEntityId(pageEntityId);
          return router.push(
            constructPageRelativeUrl({
              workspaceShortname: shortname,
              pageEntityUuid,
            }),
          );
        }
      }
    },
    [createPageFn, ownedById, setParentPageFn, router, shortname],
  );

  return [
    createSubPage,
    { loading: createPageLoading || setParentPageLoading },
  ] as const;
};
