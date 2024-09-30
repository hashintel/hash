import type {
  EntityType,
  PropertyType,
  VersionedUrl,
} from "@blockprotocol/type-system";
import { extractVersion } from "@blockprotocol/type-system";
import type { SizedGridColumn } from "@glideapps/glide-data-grid";
import type { Entity } from "@local/hash-graph-sdk/entity";
import type { EntityId } from "@local/hash-graph-types/entity";
import type { BaseUrl } from "@local/hash-graph-types/ontology";
import { generateEntityLabel } from "@local/hash-isomorphic-utils/generate-entity-label";
import { includesPageEntityTypeId } from "@local/hash-isomorphic-utils/page-entity-type-ids";
import { simplifyProperties } from "@local/hash-isomorphic-utils/simplify-properties";
import { stringifyPropertyValue } from "@local/hash-isomorphic-utils/stringify-property-value";
import type { PageProperties } from "@local/hash-isomorphic-utils/system-types/shared";
import type { EntityRootType, Subgraph } from "@local/hash-subgraph";
import { extractBaseUrl } from "@local/hash-subgraph/type-system-patch";
import { format } from "date-fns";
import { useMemo } from "react";

import { useGetOwnerForEntity } from "../../../components/hooks/use-get-owner-for-entity";
import type { MinimalActor } from "../../../shared/use-actors";
import { useActors } from "../../../shared/use-actors";

export interface TypeEntitiesRow {
  rowId: string;
  entityId: EntityId;
  entity: Entity;
  entityLabel: string;
  entityTypes: {
    entityTypeId: VersionedUrl;
    icon?: string;
    title: string;
  }[];
  archived?: boolean;
  lastEdited: string;
  lastEditedBy?: MinimalActor | "loading";
  created: string;
  createdBy?: MinimalActor | "loading";
  web: string;
  properties?: {
    [k: string]: string;
  };
  /** @todo: get rid of this by typing `columnId` */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  [key: string]: any;
}

export const useEntitiesTable = (params: {
  entities?: Entity[];
  entityTypes?: EntityType[];
  propertyTypes?: PropertyType[];
  subgraph?: Subgraph<EntityRootType>;
  hidePageArchivedColumn?: boolean;
  hideEntityTypeVersionColumn?: boolean;
  hidePropertiesColumns: boolean;
  isViewingPages?: boolean;
}) => {
  const {
    entities,
    entityTypes,
    propertyTypes,
    subgraph,
    hidePageArchivedColumn = false,
    hideEntityTypeVersionColumn = false,
    hidePropertiesColumns,
    isViewingPages = false,
  } = params;

  const editorActorIds = useMemo(
    () =>
      entities?.flatMap(({ metadata }) => [
        metadata.provenance.edition.createdById,
        metadata.provenance.createdById,
      ]),
    [entities],
  );

  const { actors, loading: actorsLoading } = useActors({
    accountIds: editorActorIds,
  });

  const getOwnerForEntity = useGetOwnerForEntity();

  const entitiesHaveSameType = useMemo(
    () =>
      !!entities &&
      !!entities.length &&
      entities
        .map(({ metadata: { entityTypeIds } }) =>
          entityTypeIds
            .sort()
            .map((entityTypeId) => extractBaseUrl(entityTypeId))
            .join(","),
        )
        .every((value, _i, all) => value === all[0]),
    [entities],
  );

  return useMemo(() => {
    const propertyColumnsMap = new Map<string, SizedGridColumn>();

    if (propertyTypes) {
      for (const propertyType of propertyTypes) {
        const propertyTypeBaseUrl = extractBaseUrl(propertyType.$id);

        if (!propertyColumnsMap.has(propertyTypeBaseUrl)) {
          propertyColumnsMap.set(propertyTypeBaseUrl, {
            id: propertyTypeBaseUrl,
            title: propertyType.title,
            width: 200,
          });
        }
      }
    }
    const propertyColumns = Array.from(propertyColumnsMap.values());

    const columns: SizedGridColumn[] = [
      {
        title: entitiesHaveSameType
          ? (entityTypes?.find(
              ({ $id }) => $id === entities?.[0]?.metadata.entityTypeIds[0],
            )?.title ?? "Entity")
          : "Entity",
        id: "entityLabel",
        width: 252,
        grow: 1,
      },
      ...(hideEntityTypeVersionColumn
        ? []
        : [
            {
              title: "Entity Type Version",
              id: "entityTypes",
              width: 250,
            },
          ]),
      {
        title: "Web",
        id: "web",
        width: 200,
      },
      ...(isViewingPages && !hidePageArchivedColumn
        ? [
            {
              title: "Archived",
              id: "archived",
              width: 200,
            },
          ]
        : []),
      {
        title: "Last Edited",
        id: "lastEdited",
        width: 200,
      },
      {
        title: "Last Edited By",
        id: "lastEditedBy",
        width: 200,
      },
      {
        title: "Created",
        id: "created",
        width: 200,
      },
      {
        title: "Created By",
        id: "createdBy",
        width: 200,
      },
      /** @todo: uncomment this when we have additional types for entities */
      // {
      //   title: "Additional Types",
      //   id: "additionalTypes",
      //   width: 250,
      // },
      ...(hidePropertiesColumns ? [] : propertyColumns),
    ];

    const rows: TypeEntitiesRow[] | undefined =
      subgraph && entityTypes
        ? entities?.map((entity) => {
            const entityLabel = generateEntityLabel(subgraph, entity);

            const currentEntitysTypes = entityTypes.filter((type) =>
              entity.metadata.entityTypeIds.includes(type.$id),
            );

            const { shortname: entityNamespace } = getOwnerForEntity({
              entityId: entity.metadata.recordId.entityId,
            });

            const entityId = entity.metadata.recordId.entityId;

            const isPage = includesPageEntityTypeId(
              entity.metadata.entityTypeIds,
            );

            /**
             * @todo: consider displaying handling this differently for pages, where
             * updates on nested blocks/text entities may be a better indicator of
             * when a page has been last edited.
             */
            const lastEdited = format(
              new Date(
                entity.metadata.temporalVersioning.decisionTime.start.limit,
              ),
              "yyyy-MM-dd HH:mm",
            );

            const lastEditedBy = actorsLoading
              ? "loading"
              : actors?.find(
                  ({ accountId }) =>
                    accountId ===
                    entity.metadata.provenance.edition.createdById,
                );

            const created = format(
              new Date(entity.metadata.provenance.createdAtDecisionTime),
              "yyyy-MM-dd HH:mm",
            );

            const createdBy = actorsLoading
              ? "loading"
              : actors?.find(
                  ({ accountId }) =>
                    accountId === entity.metadata.provenance.createdById,
                );

            return {
              rowId: entityId,
              entityId,
              entity,
              entityLabel,
              entityTypes: currentEntitysTypes.map((entityType) => ({
                title: `${entityType.title} v${extractVersion(entityType.$id)}`,
                entityTypeId: entityType.$id,
              })),
              web: `@${entityNamespace}`,
              archived: isPage
                ? simplifyProperties(entity.properties as PageProperties)
                    .archived
                : undefined,
              lastEdited,
              lastEditedBy,
              created,
              createdBy,
              /** @todo: uncomment this when we have additional types for entities */
              // additionalTypes: "",
              ...propertyColumns.reduce((fields, column) => {
                if (column.id) {
                  const propertyValue = entity.properties[column.id as BaseUrl];

                  const value =
                    typeof propertyValue === "undefined"
                      ? ""
                      : stringifyPropertyValue(propertyValue);

                  return { ...fields, [column.id]: value };
                }

                return fields;
              }, {}),
            };
          })
        : undefined;

    return { columns, rows };
  }, [
    actors,
    actorsLoading,
    entities,
    entityTypes,
    getOwnerForEntity,
    propertyTypes,
    subgraph,
    entitiesHaveSameType,
    hideEntityTypeVersionColumn,
    hidePageArchivedColumn,
    hidePropertiesColumns,
    isViewingPages,
  ]);
};
