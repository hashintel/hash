import type { ColumnFilter, FilterOption } from "./filter-menu";

/**
 * Filter state is stored as the set of *hidden* values (empty = show all), so
 * the initial "everything visible" state needs no knowledge of the data-derived
 * option list. This translates that hidden-set representation into the
 * included-set model the `FilterMenu` renders.
 */
export function buildColumnFilter<Value extends string>({
  header,
  values,
  labelOf,
  counts,
  hidden,
  onHiddenChange,
  searchable,
}: {
  /** Distinct option values, already in canonical display order. */
  values: Value[];
  header: string;
  labelOf: (value: Value) => string;
  counts: Map<Value, number>;
  hidden: Set<Value>;
  onHiddenChange: (next: Set<Value>) => void;
  /** Passed through to the menu; defaults to searchable when omitted. */
  searchable?: boolean;
}): ColumnFilter {
  const options: FilterOption[] = values.map((value) => ({
    value,
    label: labelOf(value),
    count: counts.get(value) ?? 0,
  }));

  const selected = new Set<string>(
    values.filter((value) => !hidden.has(value)),
  );

  const onChange = (next: Set<string>) => {
    onHiddenChange(new Set(values.filter((value) => !next.has(value))));
  };

  return { header, options, selected, onChange, searchable };
}

/** Count occurrences of each key produced by `keyOf` across `items`. */
export function countBy<Item, Key>(
  items: Item[],
  keyOf: (item: Item) => Key,
): Map<Key, number> {
  const counts = new Map<Key, number>();
  for (const item of items) {
    const key = keyOf(item);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return counts;
}
