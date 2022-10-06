import {
  DataEditor,
  GridCell,
  GridCellKind,
  GridColumn,
  Item,
  EditableGridCell,
  DrawCustomCellCallback,
  DrawHeaderCallback,
  Theme,
} from "@glideapps/glide-data-grid";
import { useCallback } from "react";
import "@glideapps/glide-data-grid/dist/index.css";
import { useTheme } from "@mui/material";

type DummyItem = {
  name: string;
  value: string;
  type: string;
};

const properties: DummyItem[] = [
  { name: "Headcount", value: "221,000", type: "Number" },
  { name: "Founding date", value: "4 April 1975", type: "Number" },
  {
    name: "Product screenshots",
    value: "3 file attachments",
    type: "Number",
  },
  {
    name: "Competitive advantages",
    value: "Incumbency, Economies of scale, Respectable CEO",
    type: "Number",
  },
  { name: "Estimates user base", value: "527,404", type: "Number" },
  {
    name: "Estimated annual revenue",
    value: "$198.27 billion USD",
    type: "Number",
  },
  {
    name: "Estimated annual gross profit",
    value: "$96.937 billion USD",
    type: "Number",
  },
];

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

const indexes: (keyof DummyItem)[] = ["name", "value", "type"];

const firstColumnPadding = 36;
const columnPadding = 22;

interface PropertyTableProps {
  showSearch?: boolean;
  onSearchClose?: () => void;
}
export const PropertyTable = ({
  showSearch,
  onSearchClose,
}: PropertyTableProps) => {
  const { palette } = useTheme();

  const theme: Partial<Theme> = {
    bgHeader: "white",
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
    baseFontStyle: "500 14px Inter",
  };

  const getContent = useCallback(([col, row]: Item): GridCell => {
    const property = properties[row];

    if (!property) throw new Error();

    const propertyKey = indexes[col];

    if (!propertyKey) throw new Error();

    const value = property[propertyKey];

    switch (propertyKey) {
      case "name":
        return {
          kind: GridCellKind.Text,
          data: value,
          displayData: value,
          readonly: true,
          allowOverlay: false,
        };

      case "type":
        return {
          kind: GridCellKind.Bubble,
          data: [value],
          allowOverlay: false,
        };

      case "value":
        return {
          kind: GridCellKind.Text,
          data: value,
          displayData: value,
          allowOverlay: true,
          cursor: "pointer",
        };
    }
  }, []);

  const onCellEdited = useCallback(
    ([col, row]: Item, newValue: EditableGridCell) => {
      if (newValue.kind !== GridCellKind.Text) {
        // we only have text cells, might as well just die here.
        return;
      }

      const key = indexes[col];
      const property = properties[row];

      if (!key || !property) throw new Error();

      property[key] = newValue.data;
    },
    [],
  );

  const drawCell: DrawCustomCellCallback = useCallback(
    (args) => {
      const { cell, rect, ctx, col } = args;
      if (cell.kind !== GridCellKind.Text) return false;

      ctx.save();
      const { x, y, height, width } = rect;

      // border right
      ctx.strokeStyle = palette.gray[20];
      ctx.beginPath();
      ctx.lineWidth = 2;
      ctx.moveTo(x + width, y);
      ctx.lineTo(x + width, y + height);
      ctx.stroke();

      // text
      const paddingLeft = col === 0 ? firstColumnPadding : columnPadding;
      ctx.font = "500 14px Inter";
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
      const { x, y, width, height } = rect;

      // border-right to all columns except last one
      if (columnIndex < columns.length - 1) {
        ctx.strokeStyle = palette.gray[20];
        ctx.beginPath();
        ctx.lineWidth = 2;
        ctx.moveTo(x + width, y);
        ctx.lineTo(x + width, y + height);
        ctx.stroke();
      }

      const paddingLeft =
        columnIndex === 0 ? firstColumnPadding : columnPadding;

      ctx.font = "600 14px Inter";
      ctx.fillStyle = palette.gray[80];
      ctx.fillText(column.title, x + paddingLeft, y + height / 2);

      return true;
    },
    [palette],
  );

  return (
    <>
      <DataEditor
        /** functionality */
        columns={columns}
        rows={properties.length}
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
        /** styling  */
        theme={theme}
        width="100%"
        headerHeight={42}
        rowHeight={42}
        verticalBorder={false}
        drawFocusRing={false}
      />
      <div
        id="portal"
        style={{ position: "fixed", left: 0, top: 0, zIndex: 9999 }}
      />
    </>
  );
};
