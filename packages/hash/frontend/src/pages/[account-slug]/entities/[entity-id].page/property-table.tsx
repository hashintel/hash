import {
  DataEditor,
  GridCell,
  GridCellKind,
  GridColumn,
  Item,
  EditableGridCell,
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
    width: 200,
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
  },
];

const indexes: (keyof DummyItem)[] = ["name", "value", "type"];

export const PropertyTable = () => {
  const { palette } = useTheme();
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

  return (
    <>
      <DataEditor
        verticalBorder={false}
        columns={columns}
        rows={properties.length}
        getCellContent={getContent}
        theme={{
          bgHeader: "white",
          headerBottomBorderColor: palette.gray[20],
          horizontalBorderColor: "transparent",
          accentColor: palette.blue[70],
          textHeader: palette.gray[80],
          //   baseFontStyle: "10px",
          //   fontFamily: "Inter",
          bgHeaderHasFocus: "transparent",
        }}
        columnSelect="none"
        onCellEdited={onCellEdited}
      />
      <div
        id="portal"
        style={{ position: "fixed", left: 0, top: 0, zIndex: 9999 }}
      />
    </>
  );
};
