import {
  EntityType,
  extractVersion,
  PropertyType,
} from "@blockprotocol/type-system";
import { SizedGridColumn } from "@glideapps/glide-data-grid";
import { generateEntityLabel } from "@local/hash-isomorphic-utils/generate-entity-label";
import { isPageEntityTypeId } from "@local/hash-isomorphic-utils/page-entity-type-ids";
import { simplifyProperties } from "@local/hash-isomorphic-utils/simplify-properties";
import { stringifyPropertyValue } from "@local/hash-isomorphic-utils/stringify-property-value";
import { PageProperties } from "@local/hash-isomorphic-utils/system-types/shared";
import {
  BaseUrl,
  Entity,
  EntityId,
  EntityRootType,
  Subgraph,
} from "@local/hash-subgraph";
import { extractBaseUrl } from "@local/hash-subgraph/type-system-patch";
import { format } from "date-fns";
import { useMemo } from "react";

import { useGetOwnerForEntity } from "../../../components/hooks/use-get-owner-for-entity";
import { MinimalActor, useActors } from "../../../shared/use-actors";

export interface TypeEntitiesRow {
  rowId: string;
  entityId: EntityId;
  entity: Entity;
  entityLabel: string;
  entityTypeVersion: string;
  namespace: string;
  archived?: boolean;
  lastEdited: string;
  lastEditedBy?: MinimalActor;
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
  hideEntityTypeVersionColumn?: boolean;
  hidePropertiesColumns: boolean;
  isViewingPages?: boolean;
}) => {
  const {
    entities,
    entityTypes,
    propertyTypes,
    subgraph,
    hideEntityTypeVersionColumn = false,
    hidePropertiesColumns,
    isViewingPages = false,
  } = params;

  const lastEditedByAccountIds = useMemo(
    () =>
      entities?.map(({ metadata }) => metadata.provenance.edition.createdById),
    [entities],
  );

  const { actors } = useActors({ accountIds: lastEditedByAccountIds });

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
          ? entityTypes?.find(
              ({ $id }) => $id === entities?.[0]?.metadata.entityTypeId,
            )?.title ?? "Entity"
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
              id: "entityTypeVersion",
              width: 250,
            },
          ]),
      {
        title: "Namespace",
        id: "namespace",
        width: 250,
      },
      ...(isViewingPages
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

            const entityType = entityTypes.find(
              (type) => type.$id === entity.metadata.entityTypeId,
            );

            const { shortname: entityNamespace } = getOwnerForEntity(entity);

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

            const lastEditedBy = actors?.find(
              ({ accountId }) =>
                accountId === entity.metadata.provenance.edition.createdById,
            );

            return {
              rowId: entityId,
              entityId,
              entity,
              entityLabel,
              entityTypeVersion: entityType
                ? `v${extractVersion(entityType.$id)} ${entityType.title}`
                : "",
              namespace: `@${entityNamespace}`,
              archived: isPage
                ? simplifyProperties(entity.properties as PageProperties)
                    .archived
                : undefined,
              lastEdited,
              lastEditedBy,
              /** @todo: uncomment this when we have additional types for entities */
              // additionalTypes: "",
              properties: propertyColumns.reduce((fields, column) => {
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
    entities,
    entityTypes,
    getOwnerForEntity,
    propertyTypes,
    subgraph,
    entitiesHaveSameType,
    hideEntityTypeVersionColumn,
    hidePropertiesColumns,
    isViewingPages,
    actors,
  ]);
};
