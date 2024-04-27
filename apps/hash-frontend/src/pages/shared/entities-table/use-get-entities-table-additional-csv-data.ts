import { useLazyQuery } from "@apollo/client";
import type { EntityType, PropertyType } from "@blockprotocol/type-system";
import {
  currentTimeInstantTemporalAxes,
  mapGqlSubgraphFieldsFragmentToSubgraph,
  zeroedGraphResolveDepths,
} from "@local/hash-isomorphic-utils/graph-queries";
import { stringifyPropertyValue } from "@local/hash-isomorphic-utils/stringify-property-value";
import type {
  Entity,
  EntityRootType,
  EntityTypeWithMetadata,
} from "@local/hash-subgraph";
import { extractEntityUuidFromEntityId } from "@local/hash-subgraph";
import { getEntityTypeById, getRoots } from "@local/hash-subgraph/stdlib";
import type { LinkEntity } from "@local/hash-subgraph/type-system-patch";
import { extractBaseUrl } from "@local/hash-subgraph/type-system-patch";
import type { MutableRefObject } from "react";
import { useCallback } from "react";

import type {
  StructuralQueryEntitiesQuery,
  StructuralQueryEntitiesQueryVariables,
} from "../../../graphql/api-types.gen";
import { structuralQueryEntitiesQuery } from "../../../graphql/queries/knowledge/entity.queries";
import type { GetAdditionalCsvDataFunction } from "../../../shared/table-header";
import type { TypeEntitiesRow } from "./use-entities-table";

export const useGetEntitiesTableAdditionalCsvData = (props: {
  currentlyDisplayedRowsRef: MutableRefObject<TypeEntitiesRow[] | null>;
  addPropertiesColumns: boolean;
  propertyTypes?: PropertyType[];
}) => {
  const { currentlyDisplayedRowsRef, propertyTypes, addPropertiesColumns } =
    props;

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
              isOfType: { outgoing: 1 },
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
          const linkEntityType = getEntityTypeById(
            outgoingLinksSubgraph,
            linkEntity.metadata.entityTypeId,
          )!;

          return {
            linkEntity,
            linkEntityType,
          };
        })
        .flat();
    },
    [structuralQueryEntities],
  );

  const getEntitiesTableAdditionalCsvData =
    useCallback<GetAdditionalCsvDataFunction>(async () => {
      const currentlyDisplayedRows = currentlyDisplayedRowsRef.current;
      if (!currentlyDisplayedRows) {
        return null;
      }

      // Entity property columns

      const propertyColumns = addPropertiesColumns
        ? currentlyDisplayedRows.reduce<PropertyType[]>((prev, row) => {
            const { entity } = row;

            const propertyTypesUsedInEntity = Object.keys(
              entity.properties,
            ).map((baseUrl) => {
              const propertyType = propertyTypes?.find(
                ({ $id }) => extractBaseUrl($id) === baseUrl,
              );

              if (!propertyType) {
                throw new Error(`Could not find property type for ${baseUrl}`);
              }

              return propertyType;
            });

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

      const outgoingLinksWithRightEntities = await fetchOutgoingLinksOfEntities(
        {
          leftEntities: currentlyDisplayedRows.map(({ entity }) => entity),
        },
      );

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

      const prependedData: string[][] = [
        ["Entity ID"],
        ...currentlyDisplayedRows.map((row) => [row.entityId]),
      ];

      // Collate the contents of the CSV file row by row (including the header)
      const appendedData: string[][] = [
        [
          "Entity ID",
          ...propertyColumns.map(({ title }) => title),
          ...outgoingLinkColumns.map(({ title }) => title),
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

          const outgoingLinkValues = outgoingLinkColumns.map(
            (linkEntityType) => {
              const outgoingLinksOfType = outgoingLinks.filter(
                ({ linkEntityType: outgoingLinkEntityType }) =>
                  outgoingLinkEntityType.schema.$id === linkEntityType.$id,
              );

              if (outgoingLinksOfType.length > 0) {
                return `[${outgoingLinksOfType
                  .map(({ linkEntity }) => linkEntity.linkData.rightEntityId)
                  .join(", ")}]`;
              }

              return "";
            },
          );

          return [row.entityId, ...propertyValues, ...outgoingLinkValues];
        }),
      ];

      return { prependedData, appendedData };
    }, [
      currentlyDisplayedRowsRef,
      propertyTypes,
      fetchOutgoingLinksOfEntities,
      addPropertiesColumns,
    ]);

  return { getEntitiesTableAdditionalCsvData };
};
