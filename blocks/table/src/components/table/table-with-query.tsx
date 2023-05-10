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

import { ColumnKey, RootKey } from "../../additional-types";
import { BlockEntity } from "../../types/generated/block-entity";
import { Grid, ROW_HEIGHT } from "../grid/grid";

const localColumnsKey: RootKey =
  "https://blockprotocol.org/@hash/types/property-type/table-local-column/";
const localRowsKey: RootKey =
  "https://blockprotocol.org/@hash/types/property-type/table-local-row/";
const isStripedKey: RootKey =
  "https://blockprotocol.org/@hash/types/property-type/table-rows-are-striped/";
const hideHeaderRowKey: RootKey =
  "https://blockprotocol.org/@hash/types/property-type/table-header-row-is-hidden/";
const hideRowNumbersKey: RootKey =
  "https://blockprotocol.org/@hash/types/property-type/table-row-numbers-are-hidden/";

const columnTitleKey: ColumnKey =
  "https://blockprotocol.org/@blockprotocol/types/property-type/title/";
const columnIdKey: ColumnKey =
  "https://blockprotocol.org/@hash/types/property-type/table-local-column-id/";

interface TableProps {
  blockEntity: BlockEntity;
  updateEntity: (newProperties: BlockEntity["properties"]) => Promise<void>;
  readonly?: boolean;
  query: MultiFilter;
  graphModule: GraphBlockHandler;
}

export const TableWithQuery = ({
  blockEntity,
  updateEntity,
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

      if (res.data) {
        const roots = getRoots(res.data.results);
        setLoading(false);
        console.log("jej", roots);

        setEntities(roots);
      }
    };

    void init();
  }, [graphModule, query]);

  const columns = useMemo<GridColumn[]>(() => {
    const uniqueEntityTypeIds = new Set<string>();

    for (const entity of entities) {
      for (const key of Object.keys(entity.properties)) {
        uniqueEntityTypeIds.add(key);
      }
    }

    return Array.from(uniqueEntityTypeIds).map((entityTypeId) => ({
      id: entityTypeId,
      title: entityTypeId.split("/").slice(-2)[0],
      width: 200,
    }));
  }, [entities]);

  // const columns: GridColumn[] = localColumns.map((col) => ({
  //   id: col[columnIdKey],
  //   title: col[columnTitleKey] ?? "",
  //   width: 200,
  // }));

  const handleCellsEdited: DataEditorProps["onCellsEdited"] = (newValues) => {
    // const newLocalRows = produce(rows, (draftRows) => {
    //   for (const { value, location } of newValues) {
    //     const [colIndex, rowIndex] = location;

    //     const columnId = columns[colIndex]?.id;

    //     if (columnId) {
    //       // @ts-expect-error -- type instantiation is deep and possibly infinite
    //       draftRows[rowIndex][columnId] = value.data!;
    //     }
    //   }
    // });

    // updateStateAndEntity({ newLocalRows });

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
      onCellsEdited={handleCellsEdited}
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

        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access -- todo fix this
        const value = ((entities[rowIndex] as any)?.[key] ?? "") as JsonValue;

        return {
          kind: GridCellKind.Text,
          displayData: String(value),
          data: String(value),
          allowOverlay: !readonly,
        };
      }}
    />
  );
};
