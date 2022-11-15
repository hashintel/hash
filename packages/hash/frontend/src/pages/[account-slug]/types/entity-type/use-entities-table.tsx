import {
  EntityType,
  PropertyType,
  extractBaseUri,
  extractVersion,
} from "@blockprotocol/type-system-web";
import { GridColumn } from "@glideapps/glide-data-grid";
import { types } from "@hashintel/hash-shared/types";
import { useMemo } from "react";
import { Entity } from "../../../../components/hooks/blockProtocolFunctions/knowledge/knowledge-shim";
import { generateEntityLabel } from "../../../../lib/entities";
import { getEntity, Subgraph } from "../../../../lib/subgraph";
import { mustBeVersionedUri } from "./util";

export const useEntitiesTable = (
  entities?: Entity[],
  entityTypes?: EntityType[],
  propertyTypes?: PropertyType[],
  subgraph?: Subgraph,
) => {
  return useMemo(() => {
    if (!entities || !entityTypes || !propertyTypes || !subgraph) {
      return;
    }

    const propertyColumns: GridColumn[] = [];

    if (propertyTypes) {
      for (const propertyType of propertyTypes) {
        const propertyTypeBaseUri = extractBaseUri(
          mustBeVersionedUri(propertyType.$id),
        );

        if (
          propertyColumns.findIndex((col) => col.id === propertyTypeBaseUri) ===
          -1
        ) {
          propertyColumns.push({
            id: propertyTypeBaseUri,
            title: propertyType.title,
            width: 200,
          });
        }
      }
    }

    const columns: GridColumn[] = [
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

    const rows: { [k: string]: string }[] =
      entities?.map((entity) => {
        const entityLabel = generateEntityLabel({
          root: entity,
          subgraph,
        });
        const entityNamespace = getEntity(subgraph, entity.ownedById)
          ?.properties[
          extractBaseUri(types.propertyType.shortName.propertyTypeId)
        ];
        const entityType = entityTypes?.find(
          (type) => type.$id === entity.entityTypeId,
        );

        return {
          entity: entityLabel,
          entityTypeVersion: entityType
            ? `v${extractVersion(mustBeVersionedUri(entityType.$id))} ${
                entityType.title
              }`
            : "",
          namespace: entityNamespace ? `@${entityNamespace}` : "",
          /** @todo: uncomment this when we have additional types for entities */
          // additionalTypes: "",
          ...propertyColumns.reduce((fields, column) => {
            if (column.id) {
              const propertyValue = entity.properties[column.id];

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
  }, [entities, entityTypes, propertyTypes, subgraph]);
};
