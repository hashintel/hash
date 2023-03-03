import {
  EntityType,
  extractVersion,
  PropertyType,
} from "@blockprotocol/type-system";
import { SizedGridColumn } from "@glideapps/glide-data-grid";
import {
  BaseUrl,
  Entity,
  EntityRootType,
  extractEntityUuidFromEntityId,
  Subgraph,
} from "@local/hash-subgraph";
import { extractBaseUrl } from "@local/hash-subgraph/type-system-patch";
import { useMemo } from "react";

import { useGetOwnerForEntity } from "../../../../../../components/hooks/use-get-owner-for-entity";
import { generateEntityLabel } from "../../../../../../lib/entities";

export interface TypeEntitiesRow {
  entityId: string;
  entity: string;
  entityTypeVersion: string;
  namespace: string;

  [k: string]: string;
}

export const useEntitiesTable = (
  entities?: Entity[],
  entityTypes?: EntityType[],
  propertyTypes?: PropertyType[],
  subgraph?: Subgraph<EntityRootType>,
) => {
  const getOwnerForEntity = useGetOwnerForEntity();

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
        title: "Entity",
        id: "entity",
        width: 250,
        grow: 1,
      },
      {
        title: "Entity Type Version",
        id: "entityTypeVersion",
        width: 250,
      },
      {
        title: "Namespace",
        id: "namespace",
        width: 250,
      },
      /** @todo: uncomment this when we have additional types for entities */
      // {
      //   title: "Additional Types",
      //   id: "additionalTypes",
      //   width: 250,
      // },
      ...propertyColumns,
    ];

    const rows: TypeEntitiesRow[] =
      // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- improve logic or types to remove this comment
      entities.map((entity) => {
        const entityLabel = generateEntityLabel(subgraph, entity);

        const entityType = entityTypes.find(
          (type) => type.$id === entity.metadata.entityTypeId,
        );

        const { shortname: entityNamespace } = getOwnerForEntity(entity);

        const entityId = extractEntityUuidFromEntityId(
          entity.metadata.recordId.entityId,
        );

        return {
          entityId,
          entity: entityLabel,
          entityTypeVersion: entityType
            ? `v${extractVersion(entityType.$id)} ${entityType.title}`
            : "",
          namespace: `@${entityNamespace}`,
          /** @todo: uncomment this when we have additional types for entities */
          // additionalTypes: "",
          ...propertyColumns.reduce((fields, column) => {
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
  }, [entities, entityTypes, getOwnerForEntity, propertyTypes, subgraph]);
};
