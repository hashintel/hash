/**
 * The bordered table shell every form spreadsheet renders into: the scroll
 * container that registers as a navigation zone, and the table with the
 * form's fixed layout. The rows inside stay the owning table's business.
 */

import { tableContainerStyle, tableStyle } from "./form-table";

import type { ReactNode } from "react";

export interface FormSpreadsheetProps {
  /** Registers the container as a navigation zone (`useNavigationZone`). */
  attach?: (element: HTMLDivElement | null) => void;
  ariaLabel?: string;
  children: ReactNode;
}

export const FormSpreadsheet: React.FC<FormSpreadsheetProps> = ({
  attach,
  ariaLabel,
  children,
}) => (
  <div ref={attach} className={tableContainerStyle} aria-label={ariaLabel}>
    <table className={tableStyle}>{children}</table>
  </div>
);
