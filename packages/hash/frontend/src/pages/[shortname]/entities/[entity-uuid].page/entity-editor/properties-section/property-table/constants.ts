import { PropertyColumn, PropertyColumnKey } from "./types";

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
    title: "Expected type",
    id: "expectedTypes",
    width: 250,
  },
];

export const propertyGridIndexes: PropertyColumnKey[] = [
  "title",
  "value",
  "expectedTypes",
];
