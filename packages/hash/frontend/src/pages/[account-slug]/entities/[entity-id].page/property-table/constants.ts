import { GridColumn } from "@glideapps/glide-data-grid";
import { Row } from "./types";

export const gridColumns: GridColumn[] = [
  {
    title: "Property",
    id: "title",
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
    width: 200,
  },
];

export const gridIndexes: Exclude<keyof Row, "propertyTypeId">[] = [
  "title",
  "value",
  "dataTypes",
];

export const firstColumnPadding = 36;
export const columnPadding = 22;
