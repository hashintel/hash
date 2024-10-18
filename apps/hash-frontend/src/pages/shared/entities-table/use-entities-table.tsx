import type {
  EntityType,
  PropertyType,
  VersionedUrl,
} from "@blockprotocol/type-system";
import { extractVersion } from "@blockprotocol/type-system";
import type { SizedGridColumn } from "@glideapps/glide-data-grid";
import { typedEntries } from "@local/advanced-types/typed-entries";
import type { Entity } from "@local/hash-graph-sdk/entity";
import type { EntityId } from "@local/hash-graph-types/entity";
import type { BaseUrl } from "@local/hash-graph-types/ontology";
import { generateEntityLabel } from "@local/hash-isomorphic-utils/generate-entity-label";
import { isPageEntityTypeId } from "@local/hash-isomorphic-utils/page-entity-type-ids";
import { simplifyProperties } from "@local/hash-isomorphic-utils/simplify-properties";
import { stringifyPropertyValue } from "@local/hash-isomorphic-utils/stringify-property-value";
import type { PageProperties } from "@local/hash-isomorphic-utils/system-types/shared";
import type { EntityRootType, Subgraph } from "@local/hash-subgraph";
import {
  getEntityTypeById,
  getPropertyTypesForEntityType,
} from "@local/hash-subgraph/stdlib";
import { extractBaseUrl } from "@local/hash-subgraph/type-system-patch";
import { format } from "date-fns";
import { useMemo } from "react";

import { gridHeaderBaseFont } from "../../../components/grid/grid";
import { useGetOwnerForEntity } from "../../../components/hooks/use-get-owner-for-entity";
import type { MinimalActor } from "../../../shared/use-actors";
import { useActors } from "../../../shared/use-actors";

const columnDefinitionsByKey: Record<
  keyof TypeEntitiesRow,
  {
    title: string;
    id: string;
    width: number;
  }
> = {
  entityTypeVersion: {
    title: "Entity Type",
    id: "entityTypeVersion",
    width: 230,
  },
  web: {
    title: "Web",
    id: "web",
    width: 200,
  },
  archived: {
    title: "Archived",
    id: "archived",
    width: 200,
  },
  lastEdited: {
    title: "Last Edited",
    id: "lastEdited",
    width: 200,
  },
  lastEditedBy: {
    title: "Last Edited By",
    id: "lastEditedBy",
    width: 200,
  },
  created: {
    title: "Created",
    id: "created",
    width: 200,
  },
  createdBy: {
    title: "Created By",
    id: "createdBy",
    width: 200,
  },
};

export interface TypeEntitiesRow {
  rowId: string;
  entityId: EntityId;
  entity: Entity;
  entityLabel: string;
  entityTypeId: VersionedUrl;
  entityTypeVersion: string;
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

let canvas: HTMLCanvasElement | undefined = undefined;

const getTextWidth = (text: string) => {
  canvas ??= document.createElement("canvas");

  const context = canvas.getContext("2d")!;

  context.font = gridHeaderBaseFont;

  const metrics = context.measureText(text);
  return metrics.width;
};

export const useEntitiesTable = (params: {
  entities?: Entity[];
  entityTypes?: EntityType[];
  propertyTypes?: PropertyType[];
  subgraph?: Subgraph<EntityRootType>;
  hideColumns?: (keyof TypeEntitiesRow)[];
  hidePageArchivedColumn?: boolean;
  hidePropertiesColumns: boolean;
  isViewingPages?: boolean;
}) => {
  const {
    entities,
    entityTypes,
    propertyTypes,
    subgraph,
    hideColumns,
    hidePageArchivedColumn = false,
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
        .map(({ metadata: { entityTypeId } }) => extractBaseUrl(entityTypeId))
        .every((value, _i, all) => value === all[0]),
    [entities],
  );

  const usedPropertyTypes = useMemo(() => {
    if (!entities || !subgraph) {
      return [];
    }

    return entities.flatMap((entity) => {
      const entityType = getEntityTypeById(
        subgraph,
        entity.metadata.entityTypeId,
      );

      if (!entityType) {
        throw new Error(
          `Could not find entityType with id ${entity.metadata.entityTypeId} in subgraph`,
        );
      }

      return [
        ...getPropertyTypesForEntityType(entityType.schema, subgraph).values(),
      ];
    });
  }, [entities, subgraph]);

  return useMemo(() => {
    const propertyColumnsMap = new Map<string, SizedGridColumn>();

    for (const propertyType of usedPropertyTypes) {
      const propertyTypeBaseUrl = extractBaseUrl(propertyType.schema.$id);

      if (!propertyColumnsMap.has(propertyTypeBaseUrl)) {
        propertyColumnsMap.set(propertyTypeBaseUrl, {
          id: propertyTypeBaseUrl,
          title: propertyType.schema.title,
          width: getTextWidth(propertyType.schema.title) + 70,
        });
      }
    }
    const propertyColumns = Array.from(propertyColumnsMap.values());

    const columns: SizedGridColumn[] = [
      {
        title: entitiesHaveSameType
          ? (entityTypes?.find(
              ({ $id }) => $id === entities?.[0]?.metadata.entityTypeId,
            )?.title ?? "Entity")
          : "Entity",
        id: "entityLabel",
        width: 300,
        grow: 1,
      },
    ];

    const columnsToHide = hideColumns ?? [];
    if (!isViewingPages || hidePageArchivedColumn) {
      columnsToHide.push("archived");
    }

    for (const [columnKey, definition] of typedEntries(
      columnDefinitionsByKey,
    )) {
      if (!columnsToHide.includes(columnKey)) {
        columns.push(definition);
      }
    }

    if (!hidePropertiesColumns) {
      columns.push(
        ...propertyColumns.sort((a, b) => a.title.localeCompare(b.title)),
      );
    }

    const rows: TypeEntitiesRow[] | undefined =
      subgraph && entityTypes
        ? entities?.map((entity) => {
            const entityLabel = generateEntityLabel(subgraph, entity);

            const entityType = entityTypes.find(
              (type) => type.$id === entity.metadata.entityTypeId,
            );

            if (!entityType) {
              throw new Error(
                `Could not find entity type with id ${entity.metadata.entityTypeId} in subgraph`,
              );
            }

            const { shortname: entityNamespace } = getOwnerForEntity({
              entityId: entity.metadata.recordId.entityId,
            });

            const entityId = entity.metadata.recordId.entityId;

            const isPage = isPageEntityTypeId(entity.metadata.entityTypeId);

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
              entityTypeId: entityType.$id,
              entityTypeVersion: `${entityType.title} v${extractVersion(entityType.$id)}`,
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
    entitiesHaveSameType,
    entities,
    entityTypes,
    getOwnerForEntity,
    isViewingPages,
    hideColumns,
    hidePageArchivedColumn,
    hidePropertiesColumns,
    propertyTypes,
    subgraph,
    usedPropertyTypes,
  ]);
};
