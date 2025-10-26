import { useMutation } from "@apollo/client";
import type { EntityId, WebId } from "@blockprotocol/type-system";
import { extractEntityUuidFromEntityId } from "@blockprotocol/type-system";
import { useRouter } from "next/router";
import { useCallback } from "react";

import type {
  CreatePageMutation,
  CreatePageMutationVariables,
  SetParentPageMutation,
  SetParentPageMutationVariables,
} from "../../graphql/api-types.gen";
import { PageType } from "../../graphql/api-types.gen";
import { queryEntitySubgraphQuery } from "../../graphql/queries/knowledge/entity.queries";
import { createPage, setParentPage } from "../../graphql/queries/page.queries";
import { constructPageRelativeUrl } from "../../lib/routes";
import { getAccountPagesVariables } from "../../shared/account-pages-variables";

export const useCreateSubPage = ({
  shortname,
  webId,
}: {
  shortname?: string;
  webId?: WebId;
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
    awaitRefetchQueries: false,
    refetchQueries: [
      {
        query: queryEntitySubgraphQuery,
        variables: getAccountPagesVariables({ webId }),
      },
    ],
  });

  const createSubPage = useCallback(
    async (
      parentPageEntityId: EntityId,
      prevFractionalIndex: string | null,
      type: "canvas" | "document",
    ) => {
      if (!webId) {
        throw new Error("No webId provided to useCreateSubPage");
      }

      const response = await createPageFn({
        variables: {
          webId,
          properties: {
            title: "Untitled",
            type: type === "canvas" ? PageType.Canvas : PageType.Document,
          },
        },
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

        if (shortname && pageEntityId) {
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
    [createPageFn, webId, setParentPageFn, router, shortname],
  );

  return [
    createSubPage,
    { loading: createPageLoading || setParentPageLoading },
  ] as const;
};
