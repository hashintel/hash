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
  isBaseUrl,
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
import { stringifyPropertyValue } from "./stringify-property-value";
import { TypeEntitiesRow } from "./use-entities-table";

export const useEntitiesTableGenerateCsvFile = (props: {
  currentlyDisplayedRowsRef: MutableRefObject<TypeEntitiesRow[] | null>;
  columns: SizedGridColumn[];
  addPropertiesColumns: boolean;
  propertyTypes?: PropertyType[];
}) => {
  const {
    currentlyDisplayedRowsRef,
    columns,
    propertyTypes,
    addPropertiesColumns,
  } = props;

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

      return outgoingLinkEntities
        .map((linkEntity) => {
          const rightEntityRevisions = getRightEntityForLinkEntity(
            outgoingLinksSubgraph,
            linkEntity.metadata.recordId.entityId,
          )!;

          const rightEntity = rightEntityRevisions[0];

          if (!rightEntity) {
            /**
             * The user may not have access to the right entity of the
             * link, so we should handle this gracefully.
             */
            return [];
          }

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
        })
        .flat();
    },
    [structuralQueryEntities],
  );

  const generateCsvFile = useCallback<GenerateCsvFileFunction>(async () => {
    const currentlyDisplayedRows = currentlyDisplayedRowsRef.current;
    if (!currentlyDisplayedRows) {
      return null;
    }

    // Entity property columns

    const propertyColumns = addPropertiesColumns
      ? currentlyDisplayedRows.reduce<PropertyType[]>((prev, row) => {
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
        }, [])
      : [];

    // Entity outgoing link columns

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

    // Entity metadata columns (i.e. what's already being displayed in the entities table)

    const columnRowKeys = columns.map(({ id }) => id).flat();

    const tableContentColumnTitles = columns.map(({ title, id }) =>
      /**
       * If the column is the entity label column, add the word "label" to the
       * column title. Otherwise we'd end up with an "Entity" or "Page" column title,
       * making it harder to distinguish from the property/outgoing link columns.
       */
      id === "entityLabel" ? `${title} label` : title,
    );

    // Collate the contents of the CSV file row by row (including the header)
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
          const propertyValue =
            entity.properties[extractBaseUrl(propertyType.$id)];

          return typeof propertyValue === "undefined"
            ? ""
            : stringifyPropertyValue(propertyValue);
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
          } else if (isBaseUrl(key)) {
            /**
             * If the key is a base URL, then the value needs to be obtained
             * from the nested `properties` field on the row.
             */
            return row.properties?.[key] ?? "";
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
    addPropertiesColumns,
  ]);

  return { generateCsvFile };
};
