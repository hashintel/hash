import { useQuery } from "@apollo/client";
import { useMemo } from "react";

import {
  extractDraftIdFromEntityId,
  extractEntityUuidFromEntityId,
} from "@blockprotocol/type-system";
import {
  deserializeQueryEntitiesResponse,
  getClosedMultiEntityTypeFromMap,
} from "@local/hash-graph-sdk/entity";
import { generateEntityLabel } from "@local/hash-isomorphic-utils/generate-entity-label";
import { currentTimeInstantTemporalAxes } from "@local/hash-isomorphic-utils/graph-queries";

import { queryEntitiesQuery } from "../../../../../../../../graphql/queries/knowledge/entity.queries";
import { getFileProperties } from "../../../../../../../shared/get-file-properties";

import type {
  QueryEntitiesQuery,
  QueryEntitiesQueryVariables,
} from "../../../../../../../../graphql/api-types.gen";
import type { EntityId } from "@blockprotocol/type-system";
import type { IconName } from "@hashintel/ds-components";
import type { HashEntity } from "@local/hash-graph-sdk/entity";
import type {
  ClosedMultiEntityTypesDefinitions,
  ClosedMultiEntityTypesRootMap,
} from "@local/hash-graph-sdk/ontology";

export type RunEntities = {
  /** By position in the list asked for: none where the entity isn't loaded, found, or visible. */
  entities: (HashEntity | undefined)[];
  typesMap?: ClosedMultiEntityTypesRootMap;
  definitions?: ClosedMultiEntityTypesDefinitions;
  loading: boolean;
  failed: boolean;
};

export const isFileEntity = (entity: HashEntity | undefined) =>
  !!entity && !!getFileProperties(entity.properties).fileUrl;

/** The type tab an entity is on: its types, in either order. */
export const getTypeKey = (entity: HashEntity) =>
  [...entity.metadata.entityTypeIds].sort().join(" ");

/** A file by its name, with a thumbnail if it's an image, and any other entity by its label. */
export const getEntityDisplay = (
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
          meta: "Try again later",
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

/** One request for a list's entities and their types, which its rows, tables and type tabs share. */
export const useRunEntities = (entityIds: EntityId[]): RunEntities => {
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

  /* The query finds each entity's live edition and drafts by its uuid: each entity is the one the run named, else another. */
  const entities = useMemo(() => {
    const byUuid = new Map<string, HashEntity[]>();

    for (const entity of data
      ? deserializeQueryEntitiesResponse(data.queryEntities).entities
      : []) {
      const uuid = extractEntityUuidFromEntityId(
        entity.metadata.recordId.entityId,
      );
      byUuid.set(uuid, [...(byUuid.get(uuid) ?? []), entity]);
    }

    return entityIds.map((entityId) => {
      const editions =
        byUuid.get(extractEntityUuidFromEntityId(entityId)) ?? [];

      /* Else the live edition, which a draft the run created may have been published as, before any later draft. */
      return (
        editions.find(
          ({ metadata }) => metadata.recordId.entityId === entityId,
        ) ??
        editions.find(
          ({ metadata }) =>
            extractDraftIdFromEntityId(metadata.recordId.entityId) ===
            undefined,
        ) ??
        editions[0]
      );
    });
  }, [data, entityIds]);

  return {
    entities,
    typesMap: data?.queryEntities.closedMultiEntityTypes,
    definitions: data?.queryEntities.definitions,
    loading,
    failed: !!error,
  };
};
