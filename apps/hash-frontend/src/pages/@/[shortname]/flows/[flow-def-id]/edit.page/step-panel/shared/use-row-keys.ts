import { useState } from "react";

/**
 * A key for each row, kept across removals, so that a chip that collapses as it's removed isn't reused for the row
 * after it. Rows past `keys` haven't needed one kept yet, and count on from `next`.
 */
export const useRowKeys = () => {
  const [rowKeys, setRowKeys] = useState({ keys: [] as number[], next: 0 });

  const getRowKey = (index: number) =>
    rowKeys.keys[index] ?? rowKeys.next + index - rowKeys.keys.length;

  /** Drops the key of the row at `index`, of `rowCount` rows, so the rows after it keep theirs. */
  const forgetRowKey = (index: number, rowCount: number) =>
    setRowKeys(({ keys, next }) => {
      const kept = Array.from(
        { length: rowCount },
        (_, rowIndex) => keys[rowIndex] ?? next + rowIndex - keys.length,
      );

      return {
        keys: kept.toSpliced(index, 1),
        next: next + Math.max(0, rowCount - keys.length),
      };
    });

  return { getRowKey, forgetRowKey };
};
