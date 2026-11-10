import { useQuery } from "@apollo/client";

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
  loading: boolean,
): { title: string; meta: string; icon: IconName; imageUrl?: string } => {
  if (!entity || !typesMap) {
    return {
      title: loading ? "Loading…" : "Entity not found",
      meta: loading
        ? ""
        : "It may have been deleted, or be in a web you can't see",
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

  const { data, loading } = useQuery<
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

  const entities = data
    ? deserializeQueryEntitiesResponse(data.queryEntities).entities
    : [];
  const typesMap = data?.queryEntities.closedMultiEntityTypes;

  return (
    <div className={rows}>
      {entityIds.map((entityId, index) => {
        /* The query finds each entity's live edition and drafts by its uuid: the one named, else another. */
        const entity =
          entities.find(
            ({ metadata }) => metadata.recordId.entityId === entityId,
          ) ??
          entities.find(
            ({ metadata }) =>
              extractEntityUuidFromEntityId(metadata.recordId.entityId) ===
              extractEntityUuidFromEntityId(entityId),
          );
        const { title, meta, icon, imageUrl } = getRowContent(
          entity,
          typesMap,
          loading,
        );

        return (
          <a
            // A list can name the same entity twice.
            // eslint-disable-next-line react/no-array-index-key
            key={`${entityId}-${index}`}
            className={row}
            href={generateEntityPath({
              shortname: getOwnerForEntity({ entityId }).shortname,
              entityId,
              includeDraftId: true,
            })}
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
