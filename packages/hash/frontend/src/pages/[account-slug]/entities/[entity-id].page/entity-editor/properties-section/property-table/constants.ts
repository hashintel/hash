import { PropertyColumn, PropertyRow } from "./types";

export const propertyGridColumns: PropertyColumn[] = [
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
    id: "dataTypes",
    width: 200,
  },
];

export const propertyGridIndexes: Exclude<
  keyof PropertyRow,
  "propertyTypeId"
>[] = ["title", "value", "dataTypes"];
