/**
 * @layerRoot ui.adhoc-form.spreadsheet
 * @role The state-agnostic spreadsheet grammar the form's tables compose: shell, gutter cells and menus, phantom add-lines, row selection
 *
 * The bordered table shell every form spreadsheet renders into: the scroll
 * container that registers as a navigation zone, and the table with the
 * form's fixed layout. The rows inside stay the owning table's business.
 *
 * Nothing in this folder knows `AdHocScenarioState` — that is what keeps
 * the tables thin and the grammar reusable.
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
