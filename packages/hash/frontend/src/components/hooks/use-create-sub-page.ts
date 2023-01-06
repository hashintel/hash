import { useMutation } from "@apollo/client";
import {
  EntityId,
  EntityUuid,
  extractEntityUuidFromEntityId,
  OwnedById,
  Uuid,
} from "@hashintel/hash-shared/types";
import { useRouter } from "next/router";
import { useCallback } from "react";

import {
  CreatePageMutation,
  CreatePageMutationVariables,
  SetParentPageMutation,
  SetParentPageMutationVariables,
} from "../../graphql/api-types.gen";
import { getAccountPagesTree } from "../../graphql/queries/account.queries";
import { createPage, setParentPage } from "../../graphql/queries/page.queries";
import { constructPageRelativeUrl } from "../../lib/routes";
import { useWorkspaceShortnameByEntityUuid } from "./use-workspace-shortname-by-entity-uuid";

export const useCreateSubPage = (ownedById: OwnedById) => {
  const router = useRouter();
  const { workspaceShortname } = useWorkspaceShortnameByEntityUuid({
    entityUuid: ownedById as Uuid as EntityUuid,
  });

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
      { query: getAccountPagesTree, variables: { ownedById } },
    ],
  });

  const createSubPage = useCallback(
    async (parentPageEntityId: EntityId, prevIndex: string | null) => {
      const response = await createPageFn({
        variables: { ownedById, properties: { title: "Untitled" } },
      });

      if (response.data?.createPage) {
        const pageEntityId = response.data.createPage.metadata.editionId
          .baseId as EntityId;

        await setParentPageFn({
          variables: {
            pageEntityId,
            parentPageEntityId,
            prevIndex,
          },
        });

        if (
          workspaceShortname &&
          // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- @todo improve logic or types to remove this comment
          pageEntityId
        ) {
          const pageEntityUuid = extractEntityUuidFromEntityId(pageEntityId);
          return router.push(
            constructPageRelativeUrl({ workspaceShortname, pageEntityUuid }),
          );
        }
      }
    },
    [createPageFn, ownedById, setParentPageFn, router, workspaceShortname],
  );

  return [
    createSubPage,
    { loading: createPageLoading || setParentPageLoading },
  ] as const;
};
