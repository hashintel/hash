/**
 * @layerRoot ui.adhoc-form
 * @role The inline Initial State + Parameters form compiling to a generated, never-persisted scenario
 *
 * The ad-hoc scenario form: define Initial State + Parameters inline and let
 * the caller compile them through `synthesizeAdHocScenario` (plain runs) or
 * `synthesizeAdHocOptimization` (optimization). The generated scenario is
 * never persisted; this component only edits `AdHocScenarioState`.
 *
 * Three consumers share it: Quick Simulation and plain experiment creation
 * render it with `optimizable` off; optimization experiments render it with
 * `optimizable` on, which grows an Optimize control on every value slot.
 *
 * The form runs its own ad-hoc LSP session, so every expression is
 * type-checked live: open editors are Monaco documents with inline markers,
 * and closed slots underline in red carrying the first synthesis error or
 * LSP diagnostic as their tooltip.
 *
 * The whole form is keyboard-editable: every table is an arrow-key grid with
 * a phantom trailing row, and Cmd/Ctrl+Z / Shift+Cmd/Ctrl+Z walk a
 * form-level undo history (open text fields keep their own).
 */

import { use } from "react";

import { Button } from "@hashintel/ds-components";
import { css, cx } from "@hashintel/ds-helpers/css";
import {
  adHocSlotKey,
  getAdHocDocumentUri,
  synthesizeAdHocOptimization,
  toggleAdHocOptimize,
} from "@hashintel/petrinaut-core";

import { LanguageClientContext } from "../../../react/lsp/context";
import { Section, SectionList } from "../section";
import { AdHocFormContext } from "./form-context";
import {
  actionCellStyle,
  cellStyle,
  tableContainerStyle,
  tableStyle,
} from "./form-table";
import { OptimizeToggle } from "./optimize-toggle";
import { ColouredPlaceBlock, UncolouredPlaceBlock } from "./place-block";
import { emptyValue, newVariable, placeStateFor, updatePlace } from "./state";
import { useAdHocLspSession } from "./use-ad-hoc-lsp-session";
import { useAdHocFormHistory } from "./use-form-history";
import { useGridNavigation } from "./use-grid-navigation";
import { ValueEditor } from "./value-editor";
import { VariableRows } from "./variable-rows";

import type { AdHocFormServices } from "./form-context";
import type {
  AdHocNetParameter,
  AdHocScenarioState,
  AdHocSlot,
  AdHocSynthesisContext,
} from "@hashintel/petrinaut-core";

const parameterNameCellStyle = css({
  width: "[140px]",
  display: "flex",
  alignItems: "center",
  height: "[28px]",
  paddingX: "2",
  fontSize: "xs",
  fontWeight: "medium",
  color: "neutral.s110",
  overflow: "hidden",
  whiteSpace: "nowrap",
  textOverflow: "ellipsis",
});

const parameterTypeCellStyle = css({
  width: "[96px]",
  display: "flex",
  alignItems: "center",
  height: "[28px]",
  paddingX: "2",
  fontFamily: "mono",
  fontSize: "xs",
  color: "neutral.s80",
});

const parameterOptimizeCellStyle = css({
  width: "[92px]",
  paddingX: "1",
  textAlign: "center",
});

const placesListStyle = css({
  display: "flex",
  flexDirection: "column",
  gap: "5",
});

const sectionHeaderActionsStyle = css({
  display: "flex",
  justifyContent: "flex-end",
});

export interface AdHocScenarioFormProps {
  state: AdHocScenarioState;
  onChange: (state: AdHocScenarioState) => void;
  context: AdHocSynthesisContext;
  /** Grows the Optimize selection on every value slot. */
  optimizable: boolean;
}

export const AdHocScenarioForm: React.FC<AdHocScenarioFormProps> = ({
  state,
  onChange,
  context,
  optimizable,
}) => {
  const sessionId = useAdHocLspSession(state);
  const { diagnosticsByUri } = use(LanguageClientContext);
  const parametersGrid = useGridNavigation();
  // Every edit below routes through `change`, so Cmd/Ctrl+Z anywhere in the
  // form (open text fields excepted — those own their own undo) walks the
  // whole form's history.
  const { change, handleKeyDown } = useAdHocFormHistory(state, onChange);

  // A synthesis dry-run per change surfaces the rules the type system cannot
  // (bounds resolution, name collisions, optimize legality) at their slots.
  // Optimize toggles are included even for plain consumers so a stale kept
  // selection never hides an error it would cause later.
  const synthesisErrors = new Map<string, string>();
  const synthesized = synthesizeAdHocOptimization(state, context);
  if (!synthesized.ok) {
    for (const error of synthesized.errors) {
      const key = adHocSlotKey(error.slot);
      if (!synthesisErrors.has(key)) {
        synthesisErrors.set(key, error.message);
      }
    }
  }

  const services: AdHocFormServices = {
    formState: state,
    synthesisContext: context,
    optimizable,
    sessionId,
    uriFor: (slot: AdHocSlot) =>
      getAdHocDocumentUri(sessionId, adHocSlotKey(slot)),
    errorFor: (slot: AdHocSlot) => {
      const key = adHocSlotKey(slot);
      const synthesisError = synthesisErrors.get(key);
      if (synthesisError) {
        return synthesisError;
      }
      const diagnostics = diagnosticsByUri.get(
        getAdHocDocumentUri(sessionId, key),
      );
      return diagnostics?.[0]?.message;
    },
  };

  const entryFor = (parameterId: string): AdHocNetParameter =>
    state.netParameters.find((entry) => entry.parameterId === parameterId) ?? {
      parameterId,
      ...emptyValue(""),
    };

  const setEntry = (entry: AdHocNetParameter) => {
    const rest = state.netParameters.filter(
      (existing) => existing.parameterId !== entry.parameterId,
    );
    change({ ...state, netParameters: [...rest, entry] });
  };

  const addTopLevelVariable = () => {
    change({
      ...state,
      variables: [...state.variables, newVariable(state.variables)],
    });
  };

  return (
    <AdHocFormContext value={services}>
      {/* Undo/redo listens in the capture phase, so it sees keys before any
          cell handler; open text fields and Monaco pass through untouched. */}
      <div onKeyDownCapture={handleKeyDown}>
        <SectionList>
          {context.netParameters.length > 0 ? (
            <Section
              title="Parameters"
              tooltip="Override a net parameter's value for this run. Empty keeps its default."
            >
              <div className={tableContainerStyle}>
                <table className={tableStyle}>
                  <tbody>
                    {context.netParameters.map((parameter, parameterIndex) => {
                      const entry = entryFor(parameter.id);
                      const target = {
                        kind: "netParameter" as const,
                        parameterId: parameter.id,
                      };
                      return (
                        <tr key={parameter.id}>
                          <td className={cellStyle} style={{ width: 140 }}>
                            <div className={parameterNameCellStyle}>
                              {parameter.name}
                            </div>
                          </td>
                          <td className={cellStyle}>
                            <ValueEditor
                              target={target}
                              value={entry}
                              display={
                                entry.optimize
                                  ? undefined
                                  : entry.expression ||
                                    `default (${parameter.defaultValue})`
                              }
                              integer={parameter.type === "integer"}
                              booleanDomain={parameter.type === "boolean"}
                              triggerRef={parametersGrid.register(
                                parameterIndex,
                                0,
                              )}
                              onTriggerKeyDown={parametersGrid.onKeyDown(
                                parameterIndex,
                                0,
                              )}
                              onChange={(value) =>
                                setEntry({ ...entry, ...value })
                              }
                            />
                          </td>
                          <td className={cellStyle} style={{ width: 96 }}>
                            <div className={parameterTypeCellStyle}>
                              {parameter.type}
                            </div>
                          </td>
                          {optimizable ? (
                            <td
                              className={cx(
                                cellStyle,
                                parameterOptimizeCellStyle,
                              )}
                              style={{ width: 92 }}
                            >
                              <OptimizeToggle
                                label={`Optimize ${parameter.name}`}
                                value={entry.optimize !== null}
                                buttonRef={parametersGrid.register(
                                  parameterIndex,
                                  1,
                                )}
                                onKeyDown={parametersGrid.onKeyDown(
                                  parameterIndex,
                                  1,
                                )}
                                onChange={(on) =>
                                  setEntry({
                                    ...entry,
                                    ...toggleAdHocOptimize(entry, on),
                                  })
                                }
                              />
                            </td>
                          ) : null}
                          <td className={actionCellStyle} />
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </Section>
          ) : null}

          <Section
            title="Variables"
            tooltip="Named values written scenario.<name> in every expression below. They stand in for scenario parameters."
          >
            <VariableRows
              scopeLabel="Top-level variables"
              placeId={null}
              variables={state.variables}
              alwaysVisible
              onChange={(variables) => change({ ...state, variables })}
            />
            <div className={sectionHeaderActionsStyle}>
              <Button
                size="xs"
                variant="ghost"
                tone="neutral"
                iconName="plus"
                aria-label="Add a variable"
                tooltip="Add a variable"
                onClick={addTopLevelVariable}
              />
            </div>
          </Section>

          <Section
            title="Initial state"
            tooltip="Token counts and values per place. Every value is an expression."
          >
            <div className={placesListStyle}>
              {context.places.map((place) => {
                const placeState = placeStateFor(state, context, place.id);
                const colour = place.colorId
                  ? context.types.find((type) => type.id === place.colorId)
                  : undefined;

                if (placeState.kind === "coloured" && colour) {
                  return (
                    <ColouredPlaceBlock
                      key={place.id}
                      place={place}
                      colour={colour}
                      state={placeState}
                      onChange={(next) =>
                        change(
                          updatePlace(state, place.id, context, () => next),
                        )
                      }
                    />
                  );
                }
                if (placeState.kind === "uncoloured") {
                  return (
                    <UncolouredPlaceBlock
                      key={place.id}
                      place={place}
                      state={placeState}
                      onChange={(next) =>
                        change(
                          updatePlace(state, place.id, context, () => next),
                        )
                      }
                    />
                  );
                }
                return null;
              })}
            </div>
          </Section>
        </SectionList>
      </div>
    </AdHocFormContext>
  );
};
