/**
 * The quiet trailing line of a spreadsheet, slightly shorter than content
 * rows: its `+` gutter creates the entry directly, while the cells the
 * owning table renders after it follow the cell selection model — a first
 * click selects, a second click or Enter creates. Hovering anywhere on the
 * line brightens all of it.
 */

import { cx } from "@hashintel/ds-helpers/css";

import {
  gutterCellStyle,
  phantomGutterButtonStyle,
  phantomRowCellStyle,
} from "./form-table";

import type { ReactNode } from "react";

export interface PhantomLineProps {
  /** Accessible name of the `+` gutter button. */
  gutterLabel: string;
  onMaterialize: () => void;
  /** Extra class for the gutter cell (a table's gutter column width). */
  gutterClassName?: string;
  /** The line's cells, after the gutter. */
  children: ReactNode;
}

export const PhantomLine: React.FC<PhantomLineProps> = ({
  gutterLabel,
  onMaterialize,
  gutterClassName,
  children,
}) => (
  <tr>
    <td className={cx(gutterCellStyle, gutterClassName, phantomRowCellStyle)}>
      <button
        type="button"
        tabIndex={-1}
        className={phantomGutterButtonStyle}
        aria-label={gutterLabel}
        onClick={onMaterialize}
      >
        +
      </button>
    </td>
    {children}
  </tr>
);
