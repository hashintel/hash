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

import { css, cx } from "@hashintel/ds-helpers/css";

import { tableContainerStyle, tableStyle } from "./form-table";

import type { ReactNode } from "react";

// The raised tone washes the whole grid a step darker, so a primary
// spreadsheet (the token table) reads heavier than the plain-toned blocks
// beside it (a place's Variables).
const raisedContainerStyle = css({
  backgroundColor: "neutral.s05",
});

export interface FormSpreadsheetProps {
  /** Registers the container as a navigation zone (`useNavigationZone`). */
  attach?: (element: HTMLDivElement | null) => void;
  ariaLabel?: string;
  /** "raised" darkens the grid a step; "plain" (default) stays white. */
  tone?: "plain" | "raised";
  children: ReactNode;
}

export const FormSpreadsheet: React.FC<FormSpreadsheetProps> = ({
  attach,
  ariaLabel,
  tone = "plain",
  children,
}) => (
  <div
    ref={attach}
    className={cx(
      tableContainerStyle,
      tone === "raised" && raisedContainerStyle,
    )}
    aria-label={ariaLabel}
  >
    <table className={tableStyle}>{children}</table>
  </div>
);
