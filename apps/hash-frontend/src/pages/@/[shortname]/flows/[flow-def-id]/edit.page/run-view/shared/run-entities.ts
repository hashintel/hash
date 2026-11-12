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

/** Entities a run got or gave, each as the run named it, with their types. */
export type RunEntities = {
  /** By position in the list asked for: none where the entity isn't loaded, found, or visible. */
  entities: (HashEntity | undefined)[];
  typesMap?: ClosedMultiEntityTypesRootMap;
  /** The types' properties, e.g. to name a table's columns. */
  definitions?: ClosedMultiEntityTypesDefinitions;
  loading: boolean;
  failed: boolean;
};

/** A file is an entity with a file's URL. */
export const isFileEntity = (entity: HashEntity | undefined) =>
  !!entity && !!getFileProperties(entity.properties).fileUrl;

/** How an entity shows by name: a file by its name, with a thumbnail if it's an image, and anything else by its label. */
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

/** Loads entities a run got or gave, in one request, with their types. */
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
