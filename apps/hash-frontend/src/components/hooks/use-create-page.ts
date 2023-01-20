import { useMutation } from "@apollo/client";
import {
  EntityUuid,
  OwnedById,
  Uuid,
} from "@local/hash-isomorphic-utils/types";
import {
  extractEntityUuidFromEntityId,
  extractOwnedByIdFromEntityId,
} from "../hash-subgraph/src";
import { useRouter } from "next/router";
import { useCallback } from "react";

import {
  CreatePageMutation,
  CreatePageMutationVariables,
} from "../../graphql/api-types.gen";
import { getAccountPagesTree } from "../../graphql/queries/account.queries";
import { createPage } from "../../graphql/queries/page.queries";
import { constructPageRelativeUrl } from "../../lib/routes";
import { useWorkspaceShortnameByEntityUuid } from "./use-workspace-shortname-by-entity-uuid";

export const useCreatePage = (ownedById: OwnedById) => {
  const router = useRouter();

  const { workspaceShortname } = useWorkspaceShortnameByEntityUuid({
    entityUuid: ownedById as Uuid as EntityUuid,
  });

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
                  data.createPage.metadata.editionId.baseId,
                ),
              },
            },
          ]
        : [],
  });

  const createUntitledPage = useCallback(
    async (prevIndex: string | null) => {
      const response = await createPageFn({
        variables: { ownedById, properties: { title: "", prevIndex } },
      });

      const pageEntityId = response.data?.createPage.metadata.editionId.baseId;

      if (pageEntityId && workspaceShortname) {
        const pageEntityUuid = extractEntityUuidFromEntityId(pageEntityId);
        return router.push(
          constructPageRelativeUrl({ workspaceShortname, pageEntityUuid }),
        );
      }
    },
    [createPageFn, ownedById, router, workspaceShortname],
  );

  return [createUntitledPage, { loading: createPageLoading }] as const;
};
