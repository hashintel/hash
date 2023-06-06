import {
  Entity,
  GraphBlockHandler,
  JsonValue,
  MultiFilter,
} from "@blockprotocol/graph";
import { getRoots } from "@blockprotocol/graph/stdlib";
import {
  DataEditorProps,
  DataEditorRef,
  GridCellKind,
  GridColumn,
} from "@glideapps/glide-data-grid";
import { useEffect, useMemo, useRef, useState } from "react";

import { RootKey } from "../../additional-types";
import { BlockEntity } from "../../types/generated/block-entity";
import { Grid, ROW_HEIGHT } from "../grid/grid";

const isStripedKey: RootKey =
  "https://blockprotocol-fwu7vped4.stage.hash.ai/@yk_hash/types/property-type/table-rows-are-striped/";
const hideHeaderRowKey: RootKey =
  "https://blockprotocol-fwu7vped4.stage.hash.ai/@yk_hash/types/property-type/table-header-row-is-hidden/";
const hideRowNumbersKey: RootKey =
  "https://blockprotocol-fwu7vped4.stage.hash.ai/@yk_hash/types/property-type/table-row-numbers-are-hidden/";

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
  const [entities, setEntities] = useState<Entity[]>([]);

  useEffect(() => {
    const init = async () => {
      const res = await graphModule.queryEntities({
        data: {
          operation: { multiFilter: query },
          graphResolveDepths: {
            inheritsFrom: { outgoing: 0 },
            constrainsValuesOn: { outgoing: 0 },
            constrainsPropertiesOn: { outgoing: 0 },
            constrainsLinksOn: { outgoing: 0 },
            constrainsLinkDestinationsOn: { outgoing: 0 },
            isOfType: { outgoing: 0 },
            hasLeftEntity: { incoming: 0, outgoing: 0 },
            hasRightEntity: { incoming: 0, outgoing: 0 },
          },
        },
      });

      if (!res.data) {
        throw new Error(res.errors?.[0]?.message ?? "Unknown error");
      }

      const roots = getRoots(res.data.results);
      setLoading(false);

      setEntities(roots);
    };

    void init();
  }, [graphModule, query]);

  const columns = useMemo<GridColumn[]>(() => {
    const uniqueEntityTypeIds = new Set<string>(
      entities.flatMap(({ properties }) => Object.keys(properties)),
    );

    return Array.from(uniqueEntityTypeIds).map((entityTypeId) => ({
      id: entityTypeId,
      title: entityTypeId.split("/").slice(-2)[0] ?? entityTypeId,
      width: 200,
    }));
  }, [entities]);

  const handleCellEdited: DataEditorProps["onCellEdited"] = (
    [colIndex, rowIndex],
    newValue,
  ) => {
    setEntities((currentEntities) =>
      currentEntities.map((entity, index) => {
        if (index !== rowIndex) return entity;

        const column = columns[colIndex];
        const propertyTypeId = column?.id;

        if (!column || !propertyTypeId) throw new Error("Column not found");

        const newPropertyValue = newValue.data as string;

        const newProperties = {
          ...entity.properties,
          [propertyTypeId]: newPropertyValue,
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
