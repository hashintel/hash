import { useMutation } from "@apollo/client";
import type { WebId } from "@blockprotocol/type-system";
import {
  extractEntityUuidFromEntityId,
  extractWebIdFromEntityId,
} from "@blockprotocol/type-system";
import { useRouter } from "next/router";
import { useCallback } from "react";

import type {
  CreatePageMutation,
  CreatePageMutationVariables,
} from "../../graphql/api-types.gen";
import { PageType } from "../../graphql/api-types.gen";
import { queryEntitySubgraphQuery } from "../../graphql/queries/knowledge/entity.queries";
import { createPage } from "../../graphql/queries/page.queries";
import { constructPageRelativeUrl } from "../../lib/routes";
import { getAccountPagesVariables } from "../../shared/account-pages-variables";

export const useCreatePage = ({
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
  >(createPage, {
    awaitRefetchQueries: false,
    refetchQueries: ({ data }) =>
      data
        ? [
            {
              query: queryEntitySubgraphQuery,
              variables: getAccountPagesVariables({
                webId: extractWebIdFromEntityId(
                  data.createPage.metadata.recordId.entityId,
                ),
              }),
            },
          ]
        : [],
  });

  const createUntitledPage = useCallback(
    async (prevFractionalIndex: string | null, type: "canvas" | "document") => {
      if (!webId) {
        throw new Error("No webId provided to useCreatePage");
      }

      const response = await createPageFn({
        variables: {
          webId,
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
    [createPageFn, webId, router, shortname],
  );

  return [createUntitledPage, { loading: createPageLoading }] as const;
};
