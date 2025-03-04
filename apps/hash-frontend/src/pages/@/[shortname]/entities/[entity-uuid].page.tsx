import type { Entity as EntityClass } from "@local/hash-graph-sdk/entity";
import type { DraftId, EntityUuid } from "@local/hash-graph-types/entity";
import { generateEntityPath } from "@local/hash-isomorphic-utils/frontend-paths";
import { systemEntityTypes } from "@local/hash-isomorphic-utils/ontology-type-ids";
import { simplifyProperties } from "@local/hash-isomorphic-utils/simplify-properties";
import type { UserProperties } from "@local/hash-isomorphic-utils/system-types/shared";
import {
  entityIdFromComponents,
  extractDraftIdFromEntityId,
} from "@local/hash-subgraph";
import { extractBaseUrl } from "@local/hash-subgraph/type-system-patch";
import { GlobalStyles } from "@mui/system";
import { useRouter } from "next/router";
import { NextSeo } from "next-seo";
import { useCallback, useMemo, useState } from "react";

import type { NextPageWithLayout } from "../../../../shared/layout";
import { getLayoutWithSidebar } from "../../../../shared/layout";
import { Entity } from "../../../shared/entity";
import { EntityPageLoadingState } from "../../../shared/entity/entity-page-loading-state";
import { NotFound } from "../../../shared/not-found";
import { useRouteNamespace } from "../shared/use-route-namespace";

const Page: NextPageWithLayout = () => {
  const router = useRouter();
  const entityUuid = router.query["entity-uuid"] as EntityUuid;
  const draftId = router.query.draftId as DraftId | undefined;

  const { routeNamespace, loading: loadingRouteNamespace } =
    useRouteNamespace();

  /**
   * This state is only necessary to update the entity's label in the HTML <title> when the entity is loaded and when it changes.
   * The child component {@link Entity} is really managing the state and reporting changes back.
   */
  const [entityLabel, setEntityLabel] = useState<string>("");

  const onEntityLoad = useCallback(
    (initialEntity: EntityClass) => {
      if (
        initialEntity.metadata.entityTypeIds.some(
          (entityTypeId) =>
            extractBaseUrl(entityTypeId) ===
              systemEntityTypes.user.entityTypeBaseUrl ||
            extractBaseUrl(entityTypeId) ===
              systemEntityTypes.organization.entityTypeBaseUrl,
        )
      ) {
        const { shortname } = simplifyProperties(
          initialEntity.properties as UserProperties,
        );

        void router.push(shortname ? `/@${shortname}` : "/");
      }
    },
    [router],
  );

  const entityId = useMemo(
    () =>
      !routeNamespace
        ? null
        : entityIdFromComponents(routeNamespace.ownedById, entityUuid, draftId),
    [routeNamespace, entityUuid, draftId],
  );

  const onEntityUpdatedInDb = useCallback(
    (persistedEntity: EntityClass) => {
      if (!routeNamespace?.shortname) {
        return;
      }

      const { entityId: updatedEntityId } = persistedEntity.metadata.recordId;
      const latestDraftId = extractDraftIdFromEntityId(updatedEntityId);

      if (latestDraftId !== draftId) {
        /**
         * If the entity either no longer has a draftId when it did before,
         * or has a draftId when it didn't before, push to the new entityId.
         */
        const entityHref = generateEntityPath({
          shortname: routeNamespace.shortname,
          entityId: updatedEntityId,
          includeDraftId: !!latestDraftId,
        });
        void router.replace(entityHref);
      }
    },
    [draftId, router, routeNamespace],
  );

  const onRemoteDraftArchived = () => {
    void router.push("/actions");
  };

  if (loadingRouteNamespace) {
    return <EntityPageLoadingState />;
  }

  if (!entityId) {
    return <NotFound />;
  }

  return (
    <>
      <NextSeo title={`${entityLabel ? `${entityLabel} | ` : ""}HASH`} />

      <Entity
        entityId={entityId}
        isInSlide={false}
        onEntityUpdatedInDb={onEntityUpdatedInDb}
        onRemoteDraftArchived={onRemoteDraftArchived}
        onRemoteDraftPublished={onEntityUpdatedInDb}
        onEntityLoad={onEntityLoad}
        onEntityLabelChange={setEntityLabel}
      />

      <GlobalStyles
        styles={{
          body: {
            overflowY: "scroll",
          },
        }}
      />
    </>
  );
};

Page.getLayout = (page) =>
  getLayoutWithSidebar(page, {
    fullWidth: true,
  });

export default Page;
