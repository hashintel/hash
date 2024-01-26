import { useLazyQuery } from "@apollo/client";
import { EntityType, PropertyType } from "@blockprotocol/type-system";
import { SizedGridColumn } from "@glideapps/glide-data-grid";
import { generateEntityLabel } from "@local/hash-isomorphic-utils/generate-entity-label";
import {
  currentTimeInstantTemporalAxes,
  mapGqlSubgraphFieldsFragmentToSubgraph,
  zeroedGraphResolveDepths,
} from "@local/hash-isomorphic-utils/graph-queries";
import {
  Entity,
  EntityRootType,
  EntityTypeWithMetadata,
  extractEntityUuidFromEntityId,
} from "@local/hash-subgraph";
import {
  getEntityTypeById,
  getRightEntityForLinkEntity,
  getRoots,
} from "@local/hash-subgraph/stdlib";
import {
  extractBaseUrl,
  LinkEntity,
} from "@local/hash-subgraph/type-system-patch";
import { MutableRefObject, useCallback } from "react";

import {
  StructuralQueryEntitiesQuery,
  StructuralQueryEntitiesQueryVariables,
} from "../../../graphql/api-types.gen";
import { structuralQueryEntitiesQuery } from "../../../graphql/queries/knowledge/entity.queries";
import { MinimalUser } from "../../../lib/user-and-org";
import { GenerateCsvFileFunction } from "../../../shared/table-header/export-to-csv-button";
import { TypeEntitiesRow } from "./use-entities-table";

export const useEntitiesTableGenerateCsvFile = (props: {
  currentlyDisplayedRowsRef: MutableRefObject<TypeEntitiesRow[] | null>;
  columns: SizedGridColumn[];
  propertyTypes?: PropertyType[];
}) => {
  const { currentlyDisplayedRowsRef, columns, propertyTypes } = props;

  const [structuralQueryEntities] = useLazyQuery<
    StructuralQueryEntitiesQuery,
    StructuralQueryEntitiesQueryVariables
  >(structuralQueryEntitiesQuery);

  const fetchOutgoingLinksOfEntities = useCallback(
    async (params: {
      leftEntities: Entity[];
    }): Promise<
      {
        linkEntity: LinkEntity;
        rightEntity: Entity;
        rightEntityLabel: string;
        linkEntityType: EntityTypeWithMetadata;
      }[]
    > => {
      const { leftEntities } = params;

      const { data } = await structuralQueryEntities({
        variables: {
          query: {
            filter: {
              any: leftEntities.map((entity) => ({
                equal: [
                  { path: ["leftEntity", "uuid"] },
                  {
                    parameter: extractEntityUuidFromEntityId(
                      entity.metadata.recordId.entityId,
                    ),
                  },
                ],
              })),
            },
            temporalAxes: currentTimeInstantTemporalAxes,
            graphResolveDepths: {
              ...zeroedGraphResolveDepths,
              inheritsFrom: { outgoing: 255 },
              isOfType: { outgoing: 2 },
              hasRightEntity: { outgoing: 1, incoming: 0 },
            },
            includeDrafts: false,
          },
          includePermissions: false,
        },
      });

      const outgoingLinksSubgraph = data
        ? mapGqlSubgraphFieldsFragmentToSubgraph<EntityRootType>(
            data.structuralQueryEntities.subgraph,
          )
        : undefined;

      if (!outgoingLinksSubgraph) {
        throw new Error("Could not fetch outgoing links of entities");
      }

      const outgoingLinkEntities = getRoots(
        outgoingLinksSubgraph,
      ) as LinkEntity[];

      return outgoingLinkEntities.map((linkEntity) => {
        const rightEntityRevisions = getRightEntityForLinkEntity(
          outgoingLinksSubgraph,
          linkEntity.metadata.recordId.entityId,
        )!;

        const rightEntity = rightEntityRevisions[0]!;

        const rightEntityLabel = generateEntityLabel(
          outgoingLinksSubgraph,
          rightEntity,
        );

        const linkEntityType = getEntityTypeById(
          outgoingLinksSubgraph,
          linkEntity.metadata.entityTypeId,
        )!;

        return {
          linkEntity,
          rightEntity,
          rightEntityLabel,
          linkEntityType,
        };
      });
    },
    [structuralQueryEntities],
  );

  const generateCsvFile = useCallback<GenerateCsvFileFunction>(async () => {
    const currentlyDisplayedRows = currentlyDisplayedRowsRef.current;
    if (!currentlyDisplayedRows) {
      return null;
    }

    // Table contents

    const columnRowKeys = columns.map(({ id }) => id).flat();

    const tableContentColumnTitles = columns.map(({ title }) => title);

    // Entity Properties

    const propertyColumns = currentlyDisplayedRows.reduce<PropertyType[]>(
      (prev, row) => {
        const { entity } = row;

        const propertyTypesUsedInEntity = Object.keys(entity.properties).map(
          (baseUrl) => {
            const propertyType = propertyTypes?.find(
              ({ $id }) => extractBaseUrl($id) === baseUrl,
            );

            if (!propertyType) {
              throw new Error(`Could not find property type for ${baseUrl}`);
            }

            return propertyType;
          },
        );

        const newPropertyTypes = propertyTypesUsedInEntity.filter(
          (propertyType) =>
            !prev.some(
              (previouslyAddedPropertyType) =>
                previouslyAddedPropertyType.$id === propertyType.$id,
            ),
        );

        return [...prev, ...newPropertyTypes];
      },
      [],
    );

    // Outgoing links

    const outgoingLinksWithRightEntities = await fetchOutgoingLinksOfEntities({
      leftEntities: currentlyDisplayedRows.map(({ entity }) => entity),
    });

    const outgoingLinkColumns = outgoingLinksWithRightEntities.reduce<
      EntityType[]
    >((prev, { linkEntityType }) => {
      if (
        !prev.some(
          (previousLinkEntity) =>
            previousLinkEntity.$id === linkEntityType.schema.$id,
        )
      ) {
        return [...prev, linkEntityType.schema];
      }

      return prev;
    }, []);

    const content: string[][] = [
      [
        "Entity ID",
        ...propertyColumns.map(({ title }) => title),
        ...outgoingLinkColumns.map(({ title }) => title),
        ...tableContentColumnTitles,
      ],
      ...currentlyDisplayedRows.map((row) => {
        const { entity } = row;

        const propertyValues = propertyColumns.map((propertyType) => {
          /** @todo: stringify this better */
          const propertyValue =
            entity.properties[extractBaseUrl(propertyType.$id)];

          if (typeof propertyValue === "string") {
            return propertyValue;
          } else if (typeof propertyValue === "object") {
            return JSON.stringify(propertyValue);
          } else if (propertyValue !== undefined) {
            return String(propertyValue);
          }

          return "";
        });

        const outgoingLinks = outgoingLinksWithRightEntities.filter(
          ({ linkEntity }) =>
            linkEntity.linkData.leftEntityId ===
            entity.metadata.recordId.entityId,
        );

        const outgoingLinkValues = outgoingLinkColumns.map((linkEntityType) => {
          const outgoingLinksOfType = outgoingLinks.filter(
            ({ linkEntityType: outgoingLinkEntityType }) =>
              outgoingLinkEntityType.schema.$id === linkEntityType.$id,
          );

          if (outgoingLinksOfType.length > 0) {
            return outgoingLinksOfType
              .map(({ rightEntityLabel }) => rightEntityLabel)
              .join(", ");
          }

          return "";
        });

        const tableContent = columnRowKeys.map((key) => {
          const value = row[key];

          if (typeof value === "string") {
            return value;
          } else if (key === "lastEditedBy") {
            const user: MinimalUser | undefined = value;

            return user?.preferredName ?? "";
          }

          return "";
        });

        return [
          row.entityId,
          ...propertyValues,
          ...outgoingLinkValues,
          ...tableContent,
        ];
      }),
    ];

    return {
      title: "Entities",
      content,
    };
  }, [
    currentlyDisplayedRowsRef,
    columns,
    propertyTypes,
    fetchOutgoingLinksOfEntities,
  ]);

  return { generateCsvFile };
};
