import React, { type CSSProperties } from "react";

import { cx } from "../../styled-system/css";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type CellProps<C extends Record<string, any>> = Partial<
  C & {
    cellClassName?: string;
  }
>;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function VariantGrid<C extends Record<string, any>>({
  children,
  cols,
  rows,
  cellClassName: gridCellClassName,
  gridGap = 20,
}: Readonly<{
  cols?: CellProps<C>[];
  rows?: CellProps<C>[];
  gridGap?: number;
  cellClassName?: string;
  children: (props: C) => React.ReactElement<C>;
}>) {
  cols ??= [{}];
  rows ??= [{}];
  return (
    <div
      className={
        "grid grid-flow-row auto-rows-max grid-cols-[--num-cols] items-start justify-items-start gap-[--grid-gap]"
      }
      style={
        {
          "--num-cols": `repeat(${cols.length}, minmax(max-content, 1fr))`,
          "--grid-gap": `${gridGap}px`,
        } as CSSProperties
      }
    >
      {rows.map(({ cellClassName: rowCellClassName, ...r }, i) =>
        cols.map(({ cellClassName: colCellClassName, ...c }, j) => {
          return (
            <div
              key={`row-${i}-col-${j}`}
              className={cx(
                gridCellClassName,
                rowCellClassName,
                colCellClassName,
              )}
            >
              {children({ ...c, ...r } as C)}
            </div>
          );
        }),
      )}
    </div>
  );
}
