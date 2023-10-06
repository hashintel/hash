import {
  EntityType,
  extractVersion,
  PropertyType,
} from "@blockprotocol/type-system";
import { SizedGridColumn } from "@glideapps/glide-data-grid";
import { types } from "@local/hash-isomorphic-utils/ontology-types";
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
import { useUsers } from "../../../components/hooks/use-users";
import { generateEntityLabel } from "../../../lib/entities";
import { MinimalUser } from "../../../lib/user-and-org";

export interface TypeEntitiesRow {
  rowId: string;
  entityId: EntityId;
  entity: string;
  entityTypeVersion: string;
  namespace: string;
  archived?: boolean;
  lastEdited: string;
  lastEditedBy?: MinimalUser;
  properties?: {
    [k: string]: string;
  };
  /** @todo: get rid of this by typing `columnId` */
  [key: string]: any;
}

export const useEntitiesTable = (params: {
  entities?: Entity[];
  entityTypes?: EntityType[];
  propertyTypes?: PropertyType[];
  subgraph?: Subgraph<EntityRootType>;
  hideEntityTypeVersionColumn?: boolean;
  hidePropertiesColumns?: boolean;
  isViewingPages?: boolean;
}) => {
  const {
    entities,
    entityTypes,
    propertyTypes,
    subgraph,
    hideEntityTypeVersionColumn = false,
    hidePropertiesColumns = false,
    isViewingPages = false,
  } = params;

  const { users } = useUsers();

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
    if (!entities || !entityTypes || !propertyTypes || !subgraph) {
      return;
    }

    const propertyColumnsMap = new Map<string, SizedGridColumn>();
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- improve logic or types to remove this comment
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
          ? entityTypes.find(
              ({ $id }) => $id === entities[0]?.metadata.entityTypeId,
            )?.title ?? "Entity"
          : "Entity",
        id: "entity",
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

    const rows: TypeEntitiesRow[] =
      // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- improve logic or types to remove this comment
      entities.map((entity) => {
        const entityLabel = generateEntityLabel(subgraph, entity);

        const entityType = entityTypes.find(
          (type) => type.$id === entity.metadata.entityTypeId,
        );

        const { shortname: entityNamespace } = getOwnerForEntity(entity);

        const entityId = entity.metadata.recordId.entityId;

        const isPage =
          entity.metadata.entityTypeId === types.entityType.page.entityTypeId;

        /**
         * @todo: consider displaying handling this differently for pages, where
         * updates on nested blocks/text entities may be a better indicator of
         * when a page has been last edited.
         */
        const lastEdited = format(
          new Date(entity.metadata.temporalVersioning.decisionTime.start.limit),
          "yyyy-MM-dd HH:mm",
        );

        const lastEditedBy = users?.find(
          ({ accountId }) =>
            accountId === entity.metadata.provenance.recordCreatedById,
        );

        return {
          rowId: entityId,
          entityId,
          entity: entityLabel,
          entityTypeVersion: entityType
            ? `v${extractVersion(entityType.$id)} ${entityType.title}`
            : "",
          namespace: `@${entityNamespace}`,
          archived: isPage
            ? (entity.properties[
                extractBaseUrl(types.propertyType.archived.propertyTypeId)
              ] as boolean)
            : undefined,
          lastEdited,
          lastEditedBy,
          /** @todo: uncomment this when we have additional types for entities */
          // additionalTypes: "",
          properties: propertyColumns.reduce((fields, column) => {
            if (column.id) {
              const propertyValue = entity.properties[column.id as BaseUrl];

              const value = Array.isArray(propertyValue)
                ? propertyValue.join(", ")
                : propertyValue;
              return { ...fields, [column.id]: value };
            }

            return fields;
          }, {}),
        };
      }) ?? {};

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
    users,
  ]);
};
