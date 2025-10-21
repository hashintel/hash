import type {
  DataEditorProps,
  DataEditorRef,
  GridColumn,
  GridSelection,
  Rectangle,
} from "@glideapps/glide-data-grid";
import { CompactSelection, GridCellKind } from "@glideapps/glide-data-grid";
import { ButtonBase, useTheme } from "@mui/material";
import { produce } from "immer";
import debounce from "lodash.debounce";
import isEqual from "lodash.isequal";
import type { FunctionComponent } from "react";
import { useCallback, useMemo, useRef, useState } from "react";

import type { ColumnKey, RootKey } from "../../additional-types";
import type {
  BlockEntity,
  TableLocalColumnPropertyValue,
} from "../../types/generated/block-entity";
import { Grid, ROW_HEIGHT } from "../grid/grid";
import { HeaderMenu } from "../header-menu/header-menu";
import { RowActions } from "./row-actions";

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

const emptySelection = {
  columns: CompactSelection.empty(),
  rows: CompactSelection.empty(),
};

export const Table: FunctionComponent<{
  blockEntity: BlockEntity;
  updateEntity: (newProperties: BlockEntity["properties"]) => Promise<void>;
  readonly?: boolean;
}> = ({ blockEntity, updateEntity, readonly }) => {
  const updateEntityQueue = useRef<number[]>([]);
  const gridRef = useRef<DataEditorRef>(null);

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

  /**
   * The table should always have at last 1 row, or be initialized
   * to 5 rows if there are no persisted rows yet.
   */
  const numberOfRows = localRows.length > 0 ? localRows.length : 5;

  const columns: GridColumn[] = useMemo(
    () =>
      localColumns.map((col) => ({
        id: col[columnIdKey],
        title: col[columnTitleKey] ?? "",
        width: 200,
        hasMenu: !readonly,
      })),
    [localColumns, readonly],
  );

  const isDebounceQueued = useRef(false);

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

  const updateStateAndEntity = useCallback(
    ({
      newLocalColumns,
      newLocalRows,
    }: {
      newLocalColumns?: TableLocalColumnPropertyValue[];
      newLocalRows?: Record<string, unknown>[];
    }) => {
      if (newLocalColumns) setLocalColumns(newLocalColumns);
      if (newLocalRows) setLocalRows(newLocalRows);

      isDebounceQueued.current = true;

      void debouncedUpdateEntity({
        [localColumnsKey]: newLocalColumns ?? localColumns,
        [localRowsKey]: newLocalRows ?? localRows,
      });
    },
    [debouncedUpdateEntity, localColumns, localRows],
  );

  const justClickedHeaderRef = useRef(false);

  const handleHeaderMenuClick = useCallback<
    NonNullable<DataEditorProps["onHeaderMenuClick"]>
  >((col, bounds) => {
    justClickedHeaderRef.current = true;
    setHeaderMenu({ col, bounds });
  }, []);

  const handleAddNewColumnClick = useCallback(() => {
    updateStateAndEntity({
      newLocalColumns: [
        ...localColumns,
        {
          [columnIdKey]: String(Date.now()),
          [columnTitleKey]: `Column ${localColumns.length + 1}`,
        },
      ],
    });

    setImmediate(() => {
      const col = localColumns.length;
      gridRef.current?.scrollTo(
        { amount: col, unit: "cell" },
        0,
        "horizontal",
        200,
      );

      setTimeout(() => {
        const bounds = gridRef.current?.getBounds(col, 0);
        if (!bounds) return;

        bounds.y -= ROW_HEIGHT;
        setHeaderMenu({ col, bounds });
      }, 100);
    });
  }, [localColumns, updateStateAndEntity]);

  const handleAddNewRow = useCallback(() => {
    const newLocalRows = [...localRows, {}];
    updateStateAndEntity({ newLocalRows });
  }, [localRows, updateStateAndEntity]);

  const handleCellsEdited = useCallback<
    NonNullable<DataEditorProps["onCellsEdited"]>
  >(
    (newValues) => {
      const mergedLocalRows =
        numberOfRows > localRows.length
          ? [
              ...localRows,
              ...Array<Record<string, unknown>>(
                numberOfRows - localRows.length,
              ).fill({}),
            ]
          : localRows;

      const newLocalRows = produce(mergedLocalRows, (draftRows) => {
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
    },
    [columns, localRows, numberOfRows, updateStateAndEntity],
  );

  const handleDeleteSelectedRows = useCallback(() => {
    const selectedRows = selection.rows.toArray();

    const filteredRows = localRows.filter(
      (_, index) => !selectedRows.includes(index),
    );

    const newLocalRows = filteredRows.length > 0 ? filteredRows : [{}];

    updateStateAndEntity({ newLocalRows });

    setSelection(emptySelection);
  }, [localRows, selection, updateStateAndEntity]);

  const getCellContent = useCallback<DataEditorProps["getCellContent"]>(
    ([colIndex, rowIndex]) => {
      const key = columns[colIndex]?.id;

      if (!key) {
        return {
          kind: GridCellKind.Text,
          displayData: "",
          data: "",
          allowOverlay: false,
        };
      }

      const row = localRows[rowIndex];

      const value = row && key in row ? row[key as keyof typeof row] : "";

      return {
        kind: GridCellKind.Text,
        displayData: String(value),
        data: String(value),
        allowOverlay: !readonly,
      };
    },
    [columns, localRows, readonly],
  );

  const muiTheme = useTheme();

  const getRowThemeOverride = useCallback<
    NonNullable<DataEditorProps["getRowThemeOverride"]>
  >(
    (row) => {
      if (!isStriped) {
        return undefined;
      }

      return row % 2 ? { bgCell: muiTheme.palette.gray[10] } : undefined;
    },
    [isStriped, muiTheme],
  );

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

  const selectedRowCount = selection.rows.length;

  return (
    <>
      {!!selectedRowCount && !readonly && (
        <RowActions
          selectedRowCount={selectedRowCount}
          onDelete={handleDeleteSelectedRows}
        />
      )}

      <Grid
        gridRef={gridRef}
        rowMarkerWidth={32}
        rows={numberOfRows}
        columns={columns}
        rightElement={
          !!readonly || hideHeaderRow ? null : (
            <ButtonBase
              type="button"
              onClick={handleAddNewColumnClick}
              sx={{
                padding: ({ spacing }) => spacing(0, 1.25),
                height: 40,
                display: "flex",
                alignItems: "center",
                fontWeight: 600,
                fontSize: 13,
                color: "#0f172a !important",
                width: "100%",
                justifyContent: "flex-start",
                "&:hover": {
                  backgroundColor: ({ palette }) => palette.gray[10],
                },
              }}
            >
              Add column +
            </ButtonBase>
          )
        }
        getRowThemeOverride={getRowThemeOverride}
        onPaste
        onHeaderMenuClick={handleHeaderMenuClick}
        onCellsEdited={handleCellsEdited}
        rightElementProps={{ fill: true }}
        trailingRowOptions={{
          hint: "Add row...",
          sticky: true,
          tint: true,
        }}
        onRowAppended={readonly ? undefined : handleAddNewRow}
        headerHeight={hideHeaderRow ? 0 : ROW_HEIGHT}
        rowMarkers={hideRowNumbers ? "none" : readonly ? "number" : "both"}
        rowSelectionMode="multi"
        getCellContent={getCellContent}
        gridSelection={selection}
        onGridSelectionChange={setSelection}
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
