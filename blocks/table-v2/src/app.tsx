import {
  useEntitySubgraph,
  useGraphBlockService,
  type BlockComponent,
} from "@blockprotocol/graph/react";
import { useRef } from "react";

import {
  DataEditorProps,
  GridCellKind,
  GridColumn,
} from "@glideapps/glide-data-grid";
import styles from "./base.module.scss";
import { Grid } from "./components/grid/grid";
import { TableTitle } from "./components/table-title/table-title";
import {
  LocalColumns,
  RootEntity,
  RootEntityLinkedEntities,
} from "./types.gen";

const titleKey: keyof RootEntity["properties"] =
  "https://alpha.hash.ai/@yusuf/types/property-type/table-title/";
const localColumnsKey: keyof RootEntity["properties"] =
  "https://alpha.hash.ai/@yusuf/types/property-type/local-columns/";
const localRowsKey: keyof RootEntity["properties"] =
  "https://alpha.hash.ai/@yusuf/types/property-type/local-rows/";
const columnTitleKey: keyof LocalColumns =
  "https://alpha.hash.ai/@yusuf/types/property-type/column-title/";
const columnIdKey: keyof LocalColumns =
  "https://alpha.hash.ai/@yusuf/types/property-type/column-id/";

export const App: BlockComponent<RootEntity> = ({
  graph: { blockEntitySubgraph, readonly },
}) => {
  if (!blockEntitySubgraph) {
    throw new Error("No blockEntitySubgraph provided");
  }

  const blockRootRef = useRef<HTMLDivElement>(null);
  const { graphService } = useGraphBlockService(blockRootRef);

  const { rootEntity: blockEntity } = useEntitySubgraph<
    RootEntity,
    RootEntityLinkedEntities
  >(blockEntitySubgraph);

  const {
    metadata: {
      editionId: { baseId: blockEntityId },
      entityTypeId: blockEntityTypeId,
    },
    properties: {
      [titleKey]: title = "",
      [localColumnsKey]: localColumns = [],
      [localRowsKey]: localRows = [],
    },
  } = blockEntity;

  const addNewColumn = () => {
    return updateEntity({
      [localColumnsKey]: [
        ...localColumns,
        {
          [columnIdKey]: String(Date.now()),
          [columnTitleKey]: `Column ${localColumns.length + 1}`,
        },
      ],
    });
  };

  const addNewRow = async () => {
    return updateEntity({ [localRowsKey]: [...localRows, {}] });
  };

  const handleCellEdited: DataEditorProps["onCellEdited"] = (
    [colIndex, rowIndex],
    newValue,
  ) => {
    const columnId = columns[colIndex]?.id;

    if (!columnId) {
      throw new Error("columnId not found");
    }

    const editedRow = rows[rowIndex];

    const newRows = [...rows];

    newRows[rowIndex] = { ...editedRow, [columnId]: newValue.data! };

    updateEntity({ [localRowsKey]: newRows });
  };

  const setTitle = async (val: string) => {
    await updateEntity({ [titleKey]: val });
  };

  const updateEntity = async (
    newProperties: Partial<RootEntity["properties"]>,
  ) => {
    await graphService?.updateEntity({
      data: {
        entityId: blockEntityId,
        entityTypeId: blockEntityTypeId,
        properties: { ...blockEntity.properties, ...newProperties },
      },
    });
  };

  const columns: GridColumn[] = localColumns.map((col) => ({
    id: col[columnIdKey],
    title: col[columnTitleKey],
    width: 200,
  }));
  const rows = localRows;

  return (
    <div className={styles.block} ref={blockRootRef}>
      <TableTitle onChange={setTitle} title={title} readonly={readonly} />
      <Grid
        rows={Math.max(rows.length, 13)}
        columns={columns}
        rightElement={
          readonly ? null : (
            <div className={styles.addColumnButton} onClick={addNewColumn}>
              Add a Column +
            </div>
          )
        }
        onCellEdited={handleCellEdited}
        rightElementProps={{ fill: true }}
        trailingRowOptions={{
          hint: "New row...",
          sticky: true,
          tint: true,
        }}
        onRowAppended={
          readonly
            ? undefined
            : () => {
                /**
                 * @todo this should be async, but making it async makes grid place the overlay with a weird offset
                 * needs debugging
                 */
                addNewRow();
              }
        }
        rowMarkers="both"
        getCellContent={([colIndex, rowIndex]) => {
          const key = columns[colIndex]?.id;

          if (!key) {
            throw new Error("key not found");
          }

          const value = rows[rowIndex]?.[key] ?? "";

          return {
            kind: GridCellKind.Text,
            displayData: String(value),
            data: String(value),
            allowOverlay: !readonly,
          };
        }}
      />
    </div>
  );
};
