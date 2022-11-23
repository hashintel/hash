import {
  EntityType,
  PropertyType,
  extractBaseUri,
  extractVersion,
} from "@blockprotocol/type-system-web";
import { SizedGridColumn } from "@glideapps/glide-data-grid";
import { types } from "@hashintel/hash-shared/types";
import { useMemo } from "react";
import {
  EntityWithMetadata,
  Subgraph,
  SubgraphRootTypes,
} from "@hashintel/hash-subgraph";
import { getEntityByEditionId } from "@hashintel/hash-subgraph/src/stdlib/element/entity";
import { generateEntityLabel } from "../../../../lib/entities";
import { mustBeVersionedUri } from "./util";

export interface TypeEntitiesRow {
  entity: string;
  entityTypeVersion: string;
  namespace: string;
  [k: string]: string;
}

export const useEntitiesTable = (
  entities?: EntityWithMetadata[],
  entityTypes?: EntityType[],
  propertyTypes?: PropertyType[],
  subgraph?: Subgraph<SubgraphRootTypes["entity"]>,
) => {
  return useMemo(() => {
    if (!entities || !entityTypes || !propertyTypes || !subgraph) {
      return;
    }

    const propertyColumnsMap = new Map<string, SizedGridColumn>();
    if (propertyTypes) {
      for (const propertyType of propertyTypes) {
        const propertyTypeBaseUri = extractBaseUri(
          mustBeVersionedUri(propertyType.$id),
        );

        if (!propertyColumnsMap.has(propertyTypeBaseUri)) {
          propertyColumnsMap.set(propertyTypeBaseUri, {
            id: propertyTypeBaseUri,
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
      entities?.map((entity) => {
        const entityLabel = generateEntityLabel(subgraph);
        const entityNamespace = getEntityByEditionId(
          subgraph,
          entity.metadata.editionId,
        )?.properties[
          extractBaseUri(types.propertyType.shortName.propertyTypeId)
        ];
        const entityType = entityTypes?.find(
          (type) => type.$id === entity.metadata.entityTypeId,
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
