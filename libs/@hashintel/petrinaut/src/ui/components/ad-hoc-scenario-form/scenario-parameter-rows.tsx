/**
 * The scenario-parameters table of the form's run mode: one row per exposed
 * top-level Variable — a static name, a static type, and the one thing a
 * run may change, the value. No gutter, no phantom line, no rename: the
 * scenario's structure belongs to its author, values belong to the run.
 */

import { use } from "react";

import { cx } from "@hashintel/ds-helpers/css";

import { useFocusGrid } from "../../worksheet/use-focus-grid";
import { adHocVariableKey } from "./dependency-highlight";
import { AdHocFormContext } from "./form-context";
import { FormSpreadsheet } from "./spreadsheet/form-spreadsheet";
import {
  cellStyle,
  dependencyHighlightStyle as highlightStyle,
  staticNameCellStyle,
  staticTypeCellStyle,
} from "./spreadsheet/form-table";
import { ValueEditor } from "./value-editor";

import type { AdHocVariable } from "@hashintel/petrinaut-core";

export interface ScenarioParameterRowsProps {
  /**
   * The form's top-level Variables, exposed and auxiliary alike; the rows
   * render the exposed ones under their original indices, so value edits
   * dispatch against the right slot.
   */
  variables: AdHocVariable[];
}

export const ScenarioParameterRows: React.FC<ScenarioParameterRowsProps> = ({
  variables,
}) => {
  const { highlight } = use(AdHocFormContext);
  const { register, onKeyDown, attach } = useFocusGrid();

  const exposed = variables.flatMap((variable, index) =>
    variable.exposed ? [{ variable, index }] : [],
  );
  if (exposed.length === 0) {
    return null;
  }

  return (
    <FormSpreadsheet attach={attach} ariaLabel="Scenario parameters">
      <tbody>
        {exposed.map(({ variable, index }, rowIndex) => {
          const target = {
            kind: "variable" as const,
            placeId: null,
            index,
          };
          const highlighted = highlight.variableKeys.has(
            adHocVariableKey(null, variable.name),
          );
          const rowHighlight = highlighted && highlightStyle;
          return (
            <tr key={index} data-highlighted={highlighted || undefined}>
              <td
                className={cx(cellStyle, rowHighlight)}
                style={{ width: 170 }}
              >
                <div className={staticNameCellStyle}>{variable.name}</div>
              </td>
              <td className={cx(cellStyle, rowHighlight)} style={{ width: 84 }}>
                <div className={staticTypeCellStyle}>{variable.type}</div>
              </td>
              <td className={cx(cellStyle, rowHighlight)}>
                <ValueEditor
                  value={variable}
                  target={target}
                  kind={variable.type}
                  triggerRef={register(rowIndex, 0)}
                  onTriggerKeyDown={onKeyDown(rowIndex, 0)}
                />
              </td>
            </tr>
          );
        })}
      </tbody>
    </FormSpreadsheet>
  );
};
