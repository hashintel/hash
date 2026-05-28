import { stringifyPropertyValue } from "@local/hash-isomorphic-utils/stringify-property-value";

import type { MinimalUser } from "../../../../lib/user-and-org";
import type { EntitiesTableRow } from "../types";
import type { SizedGridColumn } from "@glideapps/glide-data-grid";

export type CsvFile = {
  title: string;
  content: string[][];
};

export const generateEntitiesCsvFile = ({
  columns,
  rows,
  title,
}: {
  columns: SizedGridColumn[];
  rows: EntitiesTableRow[];
  title: string;
}): CsvFile => {
  const columnRowKeys = columns.map(({ id }) => id);

  const tableContentColumnTitles = columns.map((column) =>
    column.id === "entityLabel" ? `${column.title} label` : column.title,
  );

  const content: string[][] = [
    tableContentColumnTitles,
    ...rows.map((row) =>
      columnRowKeys.map((key) => {
        const value = row[key as keyof EntitiesTableRow];

        if (typeof value === "string") {
          return value;
        } else if (key === "lastEditedBy" || key === "createdBy") {
          const user = value as MinimalUser | undefined;
          return user?.displayName ?? "";
        } else if (key === "archived") {
          return row.archived ? "Yes" : "No";
        } else if (key === "sourceEntity" || key === "targetEntity") {
          return row.sourceEntity?.label ?? "";
        } else if (key === "entityTypes") {
          return row.entityTypes.map((type) => type.title).join(", ");
        } else {
          return stringifyPropertyValue(value);
        }
      }),
    ),
  ];

  return { title, content };
};
