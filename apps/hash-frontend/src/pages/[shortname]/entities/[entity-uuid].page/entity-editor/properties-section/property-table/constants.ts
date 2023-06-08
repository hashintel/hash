import { PropertyColumn, PropertyColumnKey } from "./types";

export const propertyGridColumns: PropertyColumn[] = [
  {
    title: "Property",
    id: "title",
    width: 280,
  },
  {
    title: "Value",
    id: "value",
    width: 450,
  },
  {
    title: "Expected type",
    id: "expectedTypes",
    width: 250,
    grow: 1,
  },
];

export const propertyGridIndexes: PropertyColumnKey[] = [
  "title",
  "value",
  "expectedTypes",
];
