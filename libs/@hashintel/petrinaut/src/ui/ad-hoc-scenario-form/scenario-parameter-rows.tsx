/**
 * The scenario-parameters table of the form's run mode: one row per exposed
 * top-level Variable — a static name, a static type, and the one thing a
 * run may change, the value. No gutter, no phantom line, no rename: the
 * scenario's structure belongs to its author, values belong to the run.
 * With an interval selection each numeric row also carries its toggle —
 * Optimize or Sweep — so an experiment can range the parameter instead of
 * fixing it.
 */

import { css, cx } from "@hashintel/ds-helpers/css";

import { FormSpreadsheet } from "../spreadsheet-kit/form-spreadsheet";
import {
  cellStyle,
  dependencyHighlightStyle as highlightStyle,
  staticNameCellStyle,
  staticTypeCellStyle,
} from "../spreadsheet-kit/form-table";
import { OptimizeToggle } from "../spreadsheet-kit/optimize-toggle";
import { useFocusGrid } from "../worksheet/use-focus-grid";
import {
  useAdHocForm,
  useAdHocFormFact,
  adHocIntervalSelection,
  adHocSelectionApplies,
  adHocSelectionText,
  sameParts,
  variableHighlights,
  variablesOf,
} from "./form-context";
import { ValueEditor } from "./value-editor";

const toggleCellStyle = css({
  width: "[92px]",
  paddingX: "1",
  textAlign: "center",
});

export const ScenarioParameterRows: React.FC = () => {
  const { selection, setFocusedValue, dispatch } = useAdHocForm();
  // The top-level Variables, exposed and auxiliary alike: the rows show the
  // exposed ones under their indices in that list, so a value edit
  // dispatches against the right Variable.
  const variables = useAdHocFormFact((facts) => variablesOf(facts, null));
  const highlightedRows = useAdHocFormFact(
    (facts) => variableHighlights(facts, null),
    sameParts,
  );
  const { register, onKeyDown, attach } = useFocusGrid({ tabStop: "native" });
  const withToggles = adHocIntervalSelection(selection);

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
          const highlighted = highlightedRows[index] ?? false;
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
              {withToggles ? (
                <td
                  className={cx(cellStyle, toggleCellStyle, rowHighlight)}
                  style={{ width: 92 }}
                  onFocus={() => setFocusedValue(target)}
                  onBlur={() => setFocusedValue(null)}
                >
                  {adHocSelectionApplies(selection, variable.type) ? (
                    <OptimizeToggle
                      text={adHocSelectionText(selection)}
                      label={`${adHocSelectionText(selection)} ${variable.name}`}
                      value={variable.optimize !== null}
                      buttonRef={register(rowIndex, 1)}
                      onKeyDown={onKeyDown(rowIndex, 1)}
                      onChange={(on) =>
                        dispatch({ type: "toggleSelection", target, on })
                      }
                    />
                  ) : null}
                </td>
              ) : null}
            </tr>
          );
        })}
      </tbody>
    </FormSpreadsheet>
  );
};
