import type {
  BaseUrl,
  Entity,
  EntityRootType,
  GraphBlockHandler,
  JsonValue,
  MultiFilter,
  PropertyType,
  Subgraph,
} from "@blockprotocol/graph";
import { extractBaseUrl, extractVersion } from "@blockprotocol/graph";
import { getPropertyTypes, getRoots } from "@blockprotocol/graph/stdlib";
import type {
  DataEditorProps,
  DataEditorRef,
  GridColumn,
} from "@glideapps/glide-data-grid";
import { GridCellKind } from "@glideapps/glide-data-grid";
import { useEffect, useMemo, useRef, useState } from "react";

import type { RootKey } from "../../additional-types";
import type { BlockEntity } from "../../types/generated/block-entity";
import { Grid, ROW_HEIGHT } from "../grid/grid";

const isStripedKey: RootKey =
  "https://blockprotocol.org/@hash/types/property-type/table-rows-are-striped/";
const hideHeaderRowKey: RootKey =
  "https://blockprotocol.org/@hash/types/property-type/table-header-row-is-hidden/";
const hideRowNumbersKey: RootKey =
  "https://blockprotocol.org/@hash/types/property-type/table-row-numbers-are-hidden/";

interface TableProps {
  blockEntity: BlockEntity;
  readonly?: boolean;
  query: MultiFilter;
  graphModule: GraphBlockHandler;
}

export const TableWithQuery = ({
  blockEntity,
  readonly,
  query,
  graphModule,
}: TableProps) => {
  const gridRef = useRef<DataEditorRef>(null);

  const {
    properties: {
      [isStripedKey]: isStriped = false,
      [hideHeaderRowKey]: hideHeaderRow = false,
      [hideRowNumbersKey]: hideRowNumbers = false,
    },
  } = blockEntity;

  const [loading, setLoading] = useState(true);

  const [subgraph, setSubgraph] = useState<Subgraph<EntityRootType>>();
  const [entities, setEntities] = useState<Entity[]>([]);

  useEffect(() => {
    const init = async () => {
      const res = await graphModule.queryEntities({
        data: {
          operation: { multiFilter: query },
          graphResolveDepths: {
            inheritsFrom: { outgoing: 255 },
            constrainsValuesOn: { outgoing: 0 },
            constrainsPropertiesOn: { outgoing: 255 },
            constrainsLinksOn: { outgoing: 0 },
            constrainsLinkDestinationsOn: { outgoing: 0 },
            isOfType: { outgoing: 1 },
            hasLeftEntity: { incoming: 0, outgoing: 0 },
            hasRightEntity: { incoming: 0, outgoing: 0 },
          },
        },
      });

      if (!res.data) {
        throw new Error(res.errors?.[0]?.message ?? "Unknown error");
      }

      const fetchedSubgraph = res.data.results;

      setSubgraph(fetchedSubgraph);
      setEntities(getRoots(fetchedSubgraph));

      setLoading(false);
    };

    void init();
  }, [graphModule, query]);

  const uniquePropertyTypeBaseUrls = useMemo<BaseUrl[]>(
    () =>
      Array.from(
        new Set<string>(
          entities.flatMap(({ properties }) => Object.keys(properties)),
        ),
      ),
    [entities],
  );

  const propertyTypes = useMemo<PropertyType[]>(() => {
    if (!subgraph) {
      return [];
    }

    const allPropertyTypes = getPropertyTypes(subgraph).map(
      ({ schema }) => schema,
    );

    return allPropertyTypes.reduce<PropertyType[]>((prev, propertyType) => {
      const previouslyAddedPropertyType = prev.find(
        (schema) =>
          extractBaseUrl(schema.$id) === extractBaseUrl(propertyType.$id),
      );

      if (!previouslyAddedPropertyType) {
        return [...prev, propertyType];
      } else if (
        extractVersion(previouslyAddedPropertyType.$id) <
        extractVersion(propertyType.$id)
      ) {
        return [
          ...prev.filter(
            (schema) => schema.$id !== previouslyAddedPropertyType.$id,
          ),
          propertyType,
        ];
      } else {
        return prev;
      }
    }, []);
  }, [subgraph]);

  const columns = useMemo<GridColumn[]>(
    () =>
      uniquePropertyTypeBaseUrls
        .map((propertyTypeBaseUrl) => ({
          id: propertyTypeBaseUrl,
          /** @todo: fetch property type in query */
          title:
            propertyTypes.find(
              (propertyType) =>
                extractBaseUrl(propertyType.$id) === propertyTypeBaseUrl,
            )?.title ??
            propertyTypeBaseUrl.split("/").slice(-2)[0] ??
            propertyTypeBaseUrl,
          width: 200,
        }))
        .sort((a, b) => a.title.localeCompare(b.title)),
    [uniquePropertyTypeBaseUrls, propertyTypes],
  );

  const handleCellEdited: DataEditorProps["onCellEdited"] = (
    [colIndex, rowIndex],
    newValue,
  ) => {
    setEntities((currentEntities) =>
      currentEntities.map((entity, index) => {
        if (index !== rowIndex) return entity;

        const column = columns[colIndex];
        const propertyTypeBaseUrl = column?.id;

        if (!column || !propertyTypeBaseUrl) {
          throw new Error("Column not found");
        }

        const newPropertyValue = newValue.data as string;

        const newProperties = {
          ...entity.properties,
          [propertyTypeBaseUrl]: newPropertyValue,
        };

        void graphModule.updateEntity({
          data: {
            entityId: entity.metadata.recordId.entityId,
            entityTypeId: entity.metadata.entityTypeId,
            properties: newProperties,
          },
        });

        return {
          ...entity,
          properties: newProperties,
        };
      }),
    );

    return true;
  };

  const getRowThemeOverride: DataEditorProps["getRowThemeOverride"] = (row) => {
    if (!isStriped) {
      return undefined;
    }

    return row % 2 ? { bgCell: "#f9f9f9" } : undefined;
  };

  if (loading) return <h4>Loading...</h4>;

  return (
    <Grid
      gridRef={gridRef}
      rowMarkerWidth={32}
      rows={entities.length}
      columns={columns}
      getRowThemeOverride={getRowThemeOverride}
      onCellEdited={handleCellEdited}
      headerHeight={hideHeaderRow ? 0 : ROW_HEIGHT}
      rowMarkers={hideRowNumbers ? "none" : "number"}
      rowSelectionMode="multi"
      getCellContent={([colIndex, rowIndex]) => {
        const key = columns[colIndex]?.id;

        if (!key) {
          return {
            kind: GridCellKind.Text,
            displayData: "",
            data: "",
            allowOverlay: false,
          };
        }

        const entity = entities[rowIndex];
        const hasValue = !!entity && key in entity.properties;
        const value = (entity?.properties[key] ?? "") as JsonValue;

        return {
          kind: GridCellKind.Text,
          displayData: String(value),
          data: String(value),
          allowOverlay: hasValue && !readonly,
        };
      }}
    />
  );
};
