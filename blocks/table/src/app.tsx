import {
  type BlockComponent,
  useEntitySubgraph,
  useGraphBlockModule,
} from "@blockprotocol/graph/react";
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

import { ColumnKey, RootKey } from "./additional-types";
import styles from "./base.module.scss";
import { Grid, ROW_HEIGHT } from "./components/grid/grid";
import { HeaderMenu } from "./components/header-menu/header-menu";
import { Settings } from "./components/settings/settings";
import { TableTitle } from "./components/table-title/table-title";
import { RootEntity, RootEntityLinkedEntities } from "./types";

const titleKey: RootKey =
  "https://blockprotocol-gkgdavns7.stage.hash.ai/@luisbett/types/property-type/title/";
const localColumnsKey: RootKey =
  "https://blockprotocol-hk4sbmd9k.stage.hash.ai/@yusuf123/types/property-type/table-local-column/";
const localRowsKey: RootKey =
  "https://blockprotocol-hk4sbmd9k.stage.hash.ai/@yusuf123/types/property-type/table-local-row/";
const isStripedKey: RootKey =
  "https://blockprotocol-hk4sbmd9k.stage.hash.ai/@yusuf123/types/property-type/is-striped/";
const hideHeaderRowKey: RootKey =
  "https://blockprotocol-hk4sbmd9k.stage.hash.ai/@yusuf123/types/property-type/hide-header-row/";
const hideRowNumbersKey: RootKey =
  "https://blockprotocol-hk4sbmd9k.stage.hash.ai/@yusuf123/types/property-type/hide-row-numbers/";

const columnTitleKey: ColumnKey =
  "https://blockprotocol-gkgdavns7.stage.hash.ai/@luisbett/types/property-type/title/";
const columnIdKey: ColumnKey =
  "https://blockprotocol-gqpc30oin.stage.hash.ai/@nate/types/property-type/id/";

const emptySelection = {
  columns: CompactSelection.empty(),
  rows: CompactSelection.empty(),
};

export const App: BlockComponent<RootEntity> = ({
  graph: { blockEntitySubgraph, readonly },
}) => {
  const blockRootRef = useRef<HTMLDivElement>(null);
  const { graphModule } = useGraphBlockModule(blockRootRef);

  const { rootEntity: blockEntity } = useEntitySubgraph<
    RootEntity,
    RootEntityLinkedEntities
  >(blockEntitySubgraph);

  const {
    metadata: {
      recordId: { entityId: blockEntityId },
      entityTypeId: blockEntityTypeId,
    },
    properties: {
      [titleKey]: title = "",
      [localColumnsKey]: localColumns = [],
      [localRowsKey]: localRows = [],
      [isStripedKey]: isStriped = false,
      [hideHeaderRowKey]: hideHeaderRow = false,
      [hideRowNumbersKey]: hideRowNumbers = false,
    },
  } = blockEntity;

  const rows = localRows;
  const columns: GridColumn[] = localColumns.map((col) => ({
    id: col[columnIdKey],
    title: col[columnTitleKey] ?? "",
    width: 200,
    hasMenu: !readonly,
  }));

  const [selection, setSelection] = useState<GridSelection>(emptySelection);
  const [headerMenu, setHeaderMenu] = useState<{
    col: number;
    bounds: Rectangle;
  }>();

  const updateEntity = async (newProperties: RootEntity["properties"]) => {
    await graphModule.updateEntity({
      data: {
        entityId: blockEntityId,
        entityTypeId: blockEntityTypeId,
        properties: { ...blockEntity.properties, ...newProperties },
      },
    });
  };

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
    const newRows = [...rows, {}];

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

  const setTitle = async (val: string) => {
    await updateEntity({ [titleKey]: val });
  };

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

  const getRowThemeOverride: DataEditorProps["getRowThemeOverride"] = (row) =>
    row % 2 ? { bgCell: "#f9f9f9" } : undefined;

  return (
    <div className={styles.block} ref={blockRootRef}>
      <div className={styles.titleWrapper}>
        <TableTitle onChange={setTitle} title={title} readonly={readonly} />
        {!readonly && (
          <Settings blockEntity={blockEntity} updateEntity={updateEntity} />
        )}
      </div>
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

          const value = rows[rowIndex]?.[key] ?? "";

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
              // delete column here
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
              // update column title here
            }}
          />,
        )}
    </div>
  );
};
