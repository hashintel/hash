import { Column } from "react-table";

import { isRecord } from "./identifyEntity";

type TableColumn = Column<Record<string, any>> & {
  columns?: TableColumn[];
};

export const makeColumns = (
  data: Record<string, any>,
  parentAccessor?: string,
  hiddenColumns?: string[]
) => {
  const columns: TableColumn[] = [];

  for (const [key, value] of Object.entries(data)) {
    const prefix = parentAccessor ? `${parentAccessor}.` : "";
    const accessor = `${prefix}${key}`;

    if (accessor.includes("__linkedData") || accessor.includes("entityType")) {
      continue;
    }
    const column: TableColumn = {
      Header: key,
      accessor,
    };
    if (isRecord(value)) {
      column.columns = makeColumns(value, accessor);
    }
    columns.push(column);
  }
  columns.sort((a, b) =>
    a.columns && !b.columns
      ? 1
      : b.columns && !a.columns
      ? -1
      : (a.accessor as string).localeCompare(b.accessor as string)
  );

  return columns;
};
