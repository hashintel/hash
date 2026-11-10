import { useQuery } from "@apollo/client";
import { useMemo } from "react";

import { extractEntityUuidFromEntityId } from "@blockprotocol/type-system";
import { Icon } from "@hashintel/ds-components";
import { css } from "@hashintel/ds-helpers/css";
import {
  deserializeQueryEntitiesResponse,
  getClosedMultiEntityTypeFromMap,
} from "@local/hash-graph-sdk/entity";
import { generateEntityPath } from "@local/hash-isomorphic-utils/frontend-paths";
import { generateEntityLabel } from "@local/hash-isomorphic-utils/generate-entity-label";
import { currentTimeInstantTemporalAxes } from "@local/hash-isomorphic-utils/graph-queries";

import { useGetOwnerForEntity } from "../../../../../../../../../components/hooks/use-get-owner-for-entity";
import { queryEntitiesQuery } from "../../../../../../../../../graphql/queries/knowledge/entity.queries";
import { getFileProperties } from "../../../../../../../../shared/get-file-properties";

import type {
  QueryEntitiesQuery,
  QueryEntitiesQueryVariables,
} from "../../../../../../../../../graphql/api-types.gen";
import type { EntityId } from "@blockprotocol/type-system";
import type { IconName } from "@hashintel/ds-components";
import type { HashEntity } from "@local/hash-graph-sdk/entity";
import type { ClosedMultiEntityTypesRootMap } from "@local/hash-graph-sdk/ontology";

const rows = css({ display: "flex", flexDirection: "column", gap: "1" });
const row = css({
  display: "flex",
  alignItems: "center",
  gap: "2",
  p: "1.5",
  borderRadius: "md",
  borderWidth: "1px",
  borderStyle: "solid",
  borderColor: "bd.subtle",
  textDecoration: "none",
  color: "fg.body",
  _hover: { bg: "bg.subtle" },
  _focusVisible: { bg: "bg.subtle" },
});
const thumbnail = css({
  display: "flex",
  flexShrink: "0",
  alignItems: "center",
  justifyContent: "center",
  width: "8",
  height: "8",
  overflow: "hidden",
  borderRadius: "sm",
  bg: "bg.subtle",
  color: "fg.muted",
});
const thumbnailImage = css({
  width: "full",
  height: "full",
  objectFit: "cover",
});
const rowText = css({
  display: "flex",
  flexDirection: "column",
  flex: "1",
  minWidth: "0",
});
const rowTitle = css({
  textStyle: "sm",
  color: "fg.heading",
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
});
const rowMeta = css({
  textStyle: "xs",
  color: "fg.subtle",
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
});
const openIcon = css({ display: "flex", color: "fg.subtle" });

/** How a row shows its entity: a file by its name, with a thumbnail if it's an image, and anything else by its label. */
const getRowContent = (
  entity: HashEntity | undefined,
  typesMap: ClosedMultiEntityTypesRootMap | undefined,
  query: { loading: boolean; failed: boolean },
): { title: string; meta: string; icon: IconName; imageUrl?: string } => {
  if (!entity || !typesMap) {
    if (query.loading) {
      return { title: "Loading…", meta: "", icon: "cube" };
    }

    return query.failed
      ? {
          title: "Couldn't load this entity",
          meta: "Its page may still open",
          icon: "cube",
        }
      : {
          title: "Entity not found",
          meta: "It may have been deleted, or be in a web you can't see",
          icon: "cube",
        };
  }

  const closedType = getClosedMultiEntityTypeFromMap(
    typesMap,
    entity.metadata.entityTypeIds,
  );
  const typeTitle = closedType.allOf.map(({ title }) => title).join(", ");
  const { displayName, fileName, fileUrl, isImage } = getFileProperties(
    entity.properties,
  );

  if (fileUrl) {
    return {
      title: displayName ?? fileName ?? generateEntityLabel(closedType, entity),
      meta: typeTitle,
      icon: "file",
      imageUrl: isImage ? fileUrl : undefined,
    };
  }

  return {
    title: generateEntityLabel(closedType, entity),
    meta: typeTitle,
    icon: "cube",
  };
};

/** Entities a step got or gave, a row each, which opens the entity's page. A file shows as a file. */
export const EntityRows = ({ entityIds }: { entityIds: EntityId[] }) => {
  const getOwnerForEntity = useGetOwnerForEntity();

  const { data, loading, error } = useQuery<
    QueryEntitiesQuery,
    QueryEntitiesQueryVariables
  >(queryEntitiesQuery, {
    variables: {
      request: {
        filter: {
          any: entityIds.map((entityId) => ({
            equal: [
              { path: ["uuid"] },
              { parameter: extractEntityUuidFromEntityId(entityId) },
            ],
          })),
        },
        temporalAxes: currentTimeInstantTemporalAxes,
        /* A flow can create its entities as drafts. */
        includeDrafts: true,
        includeEntityTypes: "resolved",
        includePermissions: false,
      },
    },
    skip: entityIds.length === 0,
    fetchPolicy: "cache-first",
  });

  /* The query finds each entity's live edition and drafts by its uuid: a row shows the one it names, else another. */
  const entitiesByUuid = useMemo(() => {
    const byUuid = new Map<string, HashEntity[]>();

    for (const entity of data
      ? deserializeQueryEntitiesResponse(data.queryEntities).entities
      : []) {
      const uuid = extractEntityUuidFromEntityId(
        entity.metadata.recordId.entityId,
      );
      byUuid.set(uuid, [...(byUuid.get(uuid) ?? []), entity]);
    }

    return byUuid;
  }, [data]);
  const typesMap = data?.queryEntities.closedMultiEntityTypes;

  return (
    <div className={rows}>
      {entityIds.map((entityId, index) => {
        const editions =
          entitiesByUuid.get(extractEntityUuidFromEntityId(entityId)) ?? [];
        const entity =
          editions.find(
            ({ metadata }) => metadata.recordId.entityId === entityId,
          ) ?? editions[0];
        const { title, meta, icon, imageUrl } = getRowContent(
          entity,
          typesMap,
          { loading, failed: !!error },
        );
        const { shortname } = getOwnerForEntity({ entityId });

        return (
          <a
            // A list can name the same entity twice.
            // eslint-disable-next-line react/no-array-index-key
            key={`${entityId}-${index}`}
            className={row}
            /* Its owner's shortname is empty until users and orgs have loaded. */
            href={
              shortname
                ? generateEntityPath({
                    shortname,
                    entityId,
                    includeDraftId: true,
                  })
                : undefined
            }
            target="_blank"
            rel="noreferrer"
          >
            <span className={thumbnail}>
              {imageUrl ? (
                <img src={imageUrl} alt="" className={thumbnailImage} />
              ) : (
                <Icon name={icon} size="sm" />
              )}
            </span>
            <span className={rowText}>
              <span className={rowTitle}>{title}</span>
              {meta && <span className={rowMeta}>{meta}</span>}
            </span>
            <span className={openIcon}>
              <Icon name="externalLink" size="xs" alt="Opens in a new tab" />
            </span>
          </a>
        );
      })}
    </div>
  );
};
