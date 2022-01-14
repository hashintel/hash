import { isRecord } from "./identifyEntity";

type TableColumn = { Header: string; accessor: string } & {
  columns?: TableColumn[];
};

const DEFAULT_HIDDEN_COLUMNS = ["__linkedData", "entityType"];

export const makeColumns = (
  data: Record<string, any>,
  parentAccessor?: string,
  hiddenColumns: string[] = DEFAULT_HIDDEN_COLUMNS,
): Pick<TableColumn, "Header" | "accessor">[] => {
  const columns: TableColumn[] = [];

  for (const [key, value] of Object.entries(data)) {
    const prefix = parentAccessor ? `${parentAccessor}.` : "";
    const accessor = `${prefix}${key}`;

    if (hiddenColumns.find((column) => accessor.includes(column))) {
      continue;
    }

    const column: TableColumn = {
      Header: accessor.split(".").join(" "),
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
      : a.accessor.localeCompare(b.accessor),
  );

  const flattenedColumns = columns.flatMap(
    (column) => column.columns ?? column,
  );

  return flattenedColumns;
};
