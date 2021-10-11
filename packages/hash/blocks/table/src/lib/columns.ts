import { Column } from "react-table";
import { isRecord } from "./identifyEntity";

type TableColumn = Column<Record<string, any>> & {
  columns?: TableColumn[];
};

const DEFAULT_HIDDEN_COLUMNS = ["__linkedData", "entityType"];

export const makeColumns = (
  data: Record<string, any>,
  parentAccessor?: string,
  hiddenColumns: string[] = DEFAULT_HIDDEN_COLUMNS
) => {
  const columns: TableColumn[] = [];

  for (const [key, value] of Object.entries(data)) {
    const prefix = parentAccessor ? `${parentAccessor}.` : "";
    const accessor = `${prefix}${key}`;

    if (hiddenColumns.find((column) => accessor.includes(column))) {
      continue;
    }

    const column: TableColumn = {
      Header: accessor.split('.').join(' '),
      accessor,
    };
    if (isRecord(value)) {
      column.columns = makeColumns(value, accessor, hiddenColumns);
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

  const flattenedColumns = columns.flatMap(column => column.columns ?? column)

  return flattenedColumns;
};
