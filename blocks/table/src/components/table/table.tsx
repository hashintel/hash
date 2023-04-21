import { JsonValue } from "@blockprotocol/graph";
import {
  CompactSelection,
  DataEditorProps,
  GridCellKind,
  GridColumn,
  GridSelection,
  Rectangle,
} from "@glideapps/glide-data-grid";
import produce from "immer";
import debounce from "lodash.debounce";
import isEqual from "lodash.isequal";
import { useCallback, useMemo, useRef, useState } from "react";

import { ColumnKey, RootKey } from "../../additional-types";
import {
  BlockEntity,
  TableLocalColumnPropertyValue,
} from "../../types/generated/block-entity";
import { Grid, ROW_HEIGHT } from "../grid/grid";
import { HeaderMenu } from "../header-menu/header-menu";
import { RowActions } from "./row-actions";
import styles from "./table.module.scss";

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
}

const emptySelection = {
  columns: CompactSelection.empty(),
  rows: CompactSelection.empty(),
};

export const Table = ({ blockEntity, updateEntity, readonly }: TableProps) => {
  const updateEntityQueue = useRef<number[]>([]);
  const isDebounceQueued = useRef(false);
  const justClickedHeaderRef = useRef(false);

  const {
    properties: {
      [localColumnsKey]: entityLocalColumns = [],
      [localRowsKey]: entityLocalRows = [],
      [isStripedKey]: isStriped = false,
      [hideHeaderRowKey]: hideHeaderRow = false,
      [hideRowNumbersKey]: hideRowNumbers = false,
    },
  } = blockEntity;

  const [localColumns, setLocalColumns] = useState(entityLocalColumns);
  const [localRows, setLocalRows] = useState(entityLocalRows);
  const [prevBlockEntity, setPrevBlockEntity] = useState(blockEntity);

  const [selection, setSelection] = useState<GridSelection>(emptySelection);
  const [headerMenu, setHeaderMenu] = useState<{
    col: number;
    bounds: Rectangle;
  }>();

  const rows = localRows;
  const columns: GridColumn[] = localColumns.map((col) => ({
    id: col[columnIdKey],
    title: col[columnTitleKey] ?? "",
    width: 200,
    hasMenu: !readonly,
  }));

  const debouncedUpdateEntity = useMemo(
    () =>
      debounce(async (newProperties: BlockEntity["properties"]) => {
        isDebounceQueued.current = false;

        const updateId = Date.now();
        updateEntityQueue.current.push(updateId);
        await updateEntity(newProperties);
        updateEntityQueue.current = updateEntityQueue.current.filter(
          (id) => id !== updateId,
        );
      }, 1000),
    [updateEntity],
  );

  const updateStateAndEntity = ({
    newLocalColumns,
    newLocalRows,
  }: {
    newLocalColumns?: TableLocalColumnPropertyValue[];
    newLocalRows?: Object[];
  }) => {
    if (newLocalColumns) setLocalColumns(newLocalColumns);
    if (newLocalRows) setLocalRows(newLocalRows);

    isDebounceQueued.current = true;
    void debouncedUpdateEntity({
      [localColumnsKey]: newLocalColumns ?? localColumns,
      [localRowsKey]: newLocalRows ?? localRows,
    });
  };

  const handleHeaderMenuClick = useCallback<
    NonNullable<DataEditorProps["onHeaderMenuClick"]>
  >((col, bounds) => {
    justClickedHeaderRef.current = true;
    setHeaderMenu({ col, bounds });
  }, []);

  const selectedRowCount = selection.rows.length;

  const addNewColumn = () => {
    updateStateAndEntity({
      newLocalColumns: [
        ...localColumns,
        {
          [columnIdKey]: String(Date.now()),
          [columnTitleKey]: `Column ${localColumns.length + 1}`,
        },
      ],
    });
  };

  const addNewRow = () => {
    const newLocalRows = [...rows, { rowId: `${rows.length}` }];
    updateStateAndEntity({ newLocalRows });
  };

  const handleCellsEdited: DataEditorProps["onCellsEdited"] = (newValues) => {
    const newLocalRows = produce(rows, (draftRows) => {
      for (const { value, location } of newValues) {
        const [colIndex, rowIndex] = location;

        const columnId = columns[colIndex]?.id;

        if (columnId) {
          // @ts-expect-error -- type instantiation is deep and possibly infinite
          draftRows[rowIndex][columnId] = value.data!;
        }
      }
    });

    updateStateAndEntity({ newLocalRows });

    return true;
  };

  const getRowThemeOverride: DataEditorProps["getRowThemeOverride"] = (row) => {
    if (!isStriped) {
      return undefined;
    }

    return row % 2 ? { bgCell: "#f9f9f9" } : undefined;
  };

  const isUpdatingEntity = updateEntityQueue.current.length > 0;
  const shouldOverrideLocalState =
    !isDebounceQueued.current && !isUpdatingEntity;

  if (blockEntity !== prevBlockEntity && shouldOverrideLocalState) {
    setPrevBlockEntity(blockEntity);

    const localColumnsChanged = !isEqual(entityLocalColumns, localColumns);
    if (localColumnsChanged) {
      setLocalColumns(entityLocalColumns);
    }

    const localRowsChanged = !isEqual(entityLocalRows, localRows);
    if (localRowsChanged) {
      setLocalRows(entityLocalRows);
    }
  }

  return (
    <>
      {!!selectedRowCount && !readonly && (
        <RowActions
          selectedRowCount={selectedRowCount}
          onDelete={() => {
            const selectedRows = selection.rows.toArray();

            updateStateAndEntity({
              newLocalRows: rows.filter(
                (_, index) => !selectedRows.includes(index),
              ),
            });

            setSelection(emptySelection);
          }}
        />
      )}

      <Grid
        rowMarkerWidth={32}
        rows={rows.length}
        columns={columns}
        rightElement={
          readonly || hideHeaderRow ? null : (
            <button
              type="button"
              className={styles.addColumnButton}
              onClick={addNewColumn}
            >
              Add a Column +
            </button>
          )
        }
        getRowThemeOverride={getRowThemeOverride}
        onPaste
        onHeaderMenuClick={handleHeaderMenuClick}
        onCellsEdited={handleCellsEdited}
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
                addNewRow();
              }
        }
        headerHeight={hideHeaderRow ? 0 : ROW_HEIGHT}
        rowMarkers={hideRowNumbers ? "none" : readonly ? "number" : "both"}
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
          const value = ((rows[rowIndex] as any)?.[key] ?? "") as JsonValue;

          return {
            kind: GridCellKind.Text,
            displayData: String(value),
            data: String(value),
            allowOverlay: !readonly,
          };
        }}
        gridSelection={selection}
        onGridSelectionChange={(newSelection) => setSelection(newSelection)}
      />
      {!!headerMenu && (
        <HeaderMenu
          key={headerMenu.col}
          title={columns[headerMenu.col]?.title ?? ""}
          bounds={headerMenu.bounds}
          onOutsideClick={() => {
            if (justClickedHeaderRef.current) {
              justClickedHeaderRef.current = false;
              return;
            }
            setHeaderMenu(undefined);
          }}
          onDelete={() => {
            updateStateAndEntity({
              newLocalColumns: localColumns.filter(
                (_, index) => index !== headerMenu.col,
              ),
            });
            setHeaderMenu(undefined);
          }}
          onClose={() => setHeaderMenu(undefined)}
          updateTitle={(newTitle) => {
            updateStateAndEntity({
              newLocalColumns: localColumns.map((col, index) =>
                index === headerMenu.col
                  ? { ...col, [columnTitleKey]: newTitle }
                  : col,
              ),
            });
          }}
        />
      )}
    </>
  );
};
