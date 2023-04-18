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
import { useCallback, useRef, useState } from "react";
import { useLayer } from "react-laag";

import { ColumnKey, RootKey } from "../../additional-types";
import { BlockEntity } from "../../types/generated/block-entity";
import { Grid, ROW_HEIGHT } from "../grid/grid";
import { HeaderMenu } from "../header-menu/header-menu";
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
  const {
    properties: {
      [localColumnsKey]: localColumns = [],
      [localRowsKey]: localRows = [],
      [isStripedKey]: isStriped = false,
      [hideHeaderRowKey]: hideHeaderRow = false,
      [hideRowNumbersKey]: hideRowNumbers = false,
    },
  } = blockEntity;

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

  const justClickedHeaderRef = useRef(false);
  const handleHeaderMenuClick = useCallback<
    NonNullable<DataEditorProps["onHeaderMenuClick"]>
  >((col, bounds) => {
    justClickedHeaderRef.current = true;
    setHeaderMenu({ col, bounds });
  }, []);

  const { layerProps, renderLayer } = useLayer({
    isOpen: !!headerMenu,
    auto: true,
    placement: "bottom-end",
    triggerOffset: 2,
    onOutsideClick: () => {
      if (justClickedHeaderRef.current) {
        justClickedHeaderRef.current = false;
        return;
      }
      setHeaderMenu(undefined);
    },
    trigger: {
      getBounds: () => ({
        left: headerMenu?.bounds.x ?? 0,
        top: headerMenu?.bounds.y ?? 0,
        width: headerMenu?.bounds.width ?? 0,
        height: headerMenu?.bounds.height ?? 0,
        right: (headerMenu?.bounds.x ?? 0) + (headerMenu?.bounds.width ?? 0),
        bottom: (headerMenu?.bounds.y ?? 0) + (headerMenu?.bounds.height ?? 0),
      }),
    },
  });

  const selectedRowCount = selection.rows.length;

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
    const newRows = [...rows, { rowId: `${rows.length}` }];

    return updateEntity({ [localRowsKey]: newRows });
  };

  // this should definitely be a sync function
  const handleCellsEdited: DataEditorProps["onCellsEdited"] = (newValues) => {
    const newRows = produce(rows, (draftRows) => {
      for (const { value, location } of newValues) {
        const [colIndex, rowIndex] = location;

        const columnId = columns[colIndex]?.id;

        if (columnId) {
          // @ts-expect-error -- type instantiation is deep and possibly infinite
          draftRows[rowIndex][columnId] = value.data!;
        }
      }
    });

    void updateEntity({ [localRowsKey]: newRows });

    return true;
  };

  const getRowThemeOverride: DataEditorProps["getRowThemeOverride"] = (row) =>
    row % 2 ? { bgCell: "#f9f9f9" } : undefined;

  return (
    <>
      {!!selectedRowCount && !readonly && (
        <div className={styles.rowActions}>
          <div>{`${selectedRowCount} ${
            selectedRowCount > 1 ? "rows" : "row"
          } selected`}</div>
          <button
            type="button"
            onClick={() => {
              const selectedRows = selection.rows.toArray();

              void updateEntity({
                [localRowsKey]: rows.filter(
                  (_, index) => !selectedRows.includes(index),
                ),
              });

              setSelection(emptySelection);
            }}
            className={styles.danger}
          >
            Delete
          </button>
        </div>
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
        getRowThemeOverride={isStriped ? getRowThemeOverride : undefined}
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
                /**
                 * @todo this should be async, but making it async makes grid place the overlay with a weird offset
                 * needs debugging
                 */
                void addNewRow();
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
      {!!headerMenu &&
        renderLayer(
          <HeaderMenu
            key={headerMenu.col}
            layerProps={layerProps}
            title={columns[headerMenu.col]?.title ?? ""}
            onDelete={() => {
              void updateEntity({
                [localColumnsKey]: localColumns.filter(
                  (_, index) => index !== headerMenu.col,
                ),
              });
              setHeaderMenu(undefined);
            }}
            onClose={() => setHeaderMenu(undefined)}
            updateTitle={(newTitle) => {
              void updateEntity({
                [localColumnsKey]: localColumns.map((col, index) =>
                  index === headerMenu.col
                    ? { ...col, [columnTitleKey]: newTitle }
                    : col,
                ),
              });
            }}
          />,
        )}
    </>
  );
};
