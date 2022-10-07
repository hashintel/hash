import {
  DataEditor,
  GridCell,
  GridCellKind,
  GridColumn,
  Item,
  DrawCustomCellCallback,
  DrawHeaderCallback,
  Theme,
  EditableGridCell,
} from "@glideapps/glide-data-grid";
import { useCallback, useMemo } from "react";
import "@glideapps/glide-data-grid/dist/index.css";
import { Box, useTheme } from "@mui/material";
import { useBlockProtocolUpdateEntity } from "../../../../components/hooks/blockProtocolFunctions/useBlockProtocolUpdateEntity";
import { EntityResponse } from "../../../../components/hooks/blockProtocolFunctions/knowledge/knowledge-shim";

type Row = {
  name: string;
  value: string;
  dataTypes: string[];
  propertyTypeId: string;
};

const columns: GridColumn[] = [
  {
    title: "Property",
    id: "name",
    width: 250,
  },
  {
    title: "Value",
    id: "value",
    grow: 1,
    width: 300,
  },
  {
    title: "Data type",
    id: "type",
    width: 150,
  },
];

const indexes: Exclude<keyof Row, "propertyTypeId">[] = [
  "name",
  "value",
  "dataTypes",
];

const firstColumnPadding = 36;
const columnPadding = 22;

interface PropertyTableProps {
  showSearch?: boolean;
  onSearchClose?: () => void;
  entity: EntityResponse;
}

export const PropertyTable = ({
  showSearch,
  onSearchClose,
  entity,
}: PropertyTableProps) => {
  const { palette } = useTheme();
  const { updateEntity, updateEntityLoading } =
    useBlockProtocolUpdateEntity(false);

  const rowData = useMemo<Row[]>(() => {
    return Object.keys(entity.properties).map((propertyTypeId) => {
      const value = entity.properties[propertyTypeId];
      const { propertyType } =
        entity.entityTypeRootedSubgraph.referencedPropertyTypes.find((val) =>
          val.propertyTypeId.startsWith(propertyTypeId),
        ) || {};

      if (!propertyType) throw new Error();

      return {
        value,
        name: propertyType.title,
        dataTypes: ["Text"],
        propertyTypeId,
      };
    });
  }, [entity]);

  const theme: Partial<Theme> = {
    bgHeader: "white",
    borderColor: palette.gray[20],
    headerBottomBorderColor: palette.gray[20],
    horizontalBorderColor: "transparent",
    accentColor: palette.blue[70],
    textHeader: palette.gray[80],
    bgHeaderHasFocus: "transparent",
    textBubble: palette.gray[70],
    bgBubble: palette.gray[20],
    accentLight: palette.gray[20],
    bgHeaderHovered: "white",
    cellHorizontalPadding: 22,
    baseFontStyle: "500 14px",
    headerFontStyle: "600 14px",
    editorFontSize: "14px",
  };

  const getContent = useCallback(
    ([col, row]: Item): GridCell => {
      const property = rowData[row];

      if (!property) throw new Error();

      const propertyKey = indexes[col];

      if (!propertyKey) throw new Error();

      const value = property[propertyKey];

      switch (propertyKey) {
        case "name":
          return {
            kind: GridCellKind.Text,
            data: value as string,
            displayData: value as string,
            readonly: true,
            allowOverlay: false,
          };

        case "dataTypes":
          return {
            kind: GridCellKind.Bubble,
            data: value as string[],
            allowOverlay: false,
          };

        case "value":
          return {
            kind: GridCellKind.Text,
            data: value as string,
            displayData: value as string,
            allowOverlay: true,
            cursor: "pointer",
          };
      }
    },
    [rowData],
  );

  const onCellEdited = useCallback(
    ([col, row]: Item, newValue: EditableGridCell) => {
      if (newValue.kind !== GridCellKind.Text) {
        // we only have text cells, might as well just die here.
        return;
      }

      const key = indexes[col];
      const property = rowData[row];

      if (!key || !property) throw new Error();

      void updateEntity({
        data: {
          entityId: entity.entityId,
          properties: { [property.propertyTypeId]: newValue.data },
        },
      });
    },
    [rowData, updateEntity, entity.entityId],
  );

  const drawCell: DrawCustomCellCallback = useCallback(
    (args) => {
      const { cell, rect, ctx, col } = args;
      if (cell.kind !== GridCellKind.Text) return false;

      ctx.save();
      const { x, y, height } = rect;

      const paddingLeft = col === 0 ? firstColumnPadding : columnPadding;
      ctx.fillStyle = palette.gray[80];
      ctx.fillText(cell.displayData, x + paddingLeft, y + height / 2 + 2);
      ctx.restore();

      return true;
    },
    [palette],
  );

  const drawHeader: DrawHeaderCallback = useCallback(
    (args) => {
      const { ctx, rect, column, columnIndex } = args;
      const { x, y, height } = rect;

      const paddingLeft =
        columnIndex === 0 ? firstColumnPadding : columnPadding;

      ctx.fillStyle = palette.gray[80];
      ctx.fillText(column.title, x + paddingLeft, y + height / 2 + 2);

      return true;
    },
    [palette],
  );

  return (
    <>
      <DataEditor
        /** functionality */
        columns={columns}
        rows={rowData.length}
        getCellContent={getContent}
        onCellEdited={onCellEdited}
        drawCell={drawCell}
        drawHeader={drawHeader}
        /** behavior */
        showSearch={showSearch}
        onSearchClose={onSearchClose}
        getCellsForSelection
        rangeSelect="cell"
        columnSelect="none"
        smoothScrollX
        smoothScrollY
        /** styling  */
        theme={theme}
        width="100%"
        headerHeight={42}
        rowHeight={42}
        drawFocusRing={false}
      />
      <div
        id="portal"
        style={{ position: "fixed", left: 0, top: 0, zIndex: 9999 }}
      />
    </>
  );
};
