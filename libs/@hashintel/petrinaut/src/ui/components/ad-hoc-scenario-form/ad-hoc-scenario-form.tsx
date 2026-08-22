/**
 * The ad-hoc scenario form: define Initial State + Parameters inline and let
 * the caller compile them through `synthesizeAdHocScenario` (plain runs) or
 * `synthesizeAdHocOptimization` (optimization). The generated scenario is
 * never persisted; this component only edits `AdHocScenarioState`.
 *
 * Three consumers share it: Quick Simulation and plain experiment creation
 * render it with `optimizable` off; optimization experiments render it with
 * `optimizable` on, which grows an Optimize toggle on every cell, shared
 * column, Variable, template count, and net parameter.
 */

import { Toggle } from "@hashintel/ds-components";
import { css } from "@hashintel/ds-helpers/css";
import { toggleAdHocOptimize } from "@hashintel/petrinaut-core";

import { Section, SectionList } from "../section";
import { ColouredPlaceBlock, UncolouredPlaceBlock } from "./place-block";
import { emptyValue, placeStateFor, updatePlace } from "./state";
import { ValueEditor } from "./value-editor";
import { VariableRows } from "./variable-rows";

import type {
  AdHocNetParameter,
  AdHocScenarioState,
  AdHocSynthesisContext,
} from "@hashintel/petrinaut-core";

const parameterRowStyle = css({
  display: "flex",
  alignItems: "center",
  gap: "2",
  fontSize: "xs",
  color: "neutral.s100",
});

const parameterNameStyle = css({
  width: "[140px]",
  flex: "[0 0 auto]",
  fontWeight: "medium",
});

const placesListStyle = css({
  display: "flex",
  flexDirection: "column",
  gap: "4",
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
  const entryFor = (parameterId: string): AdHocNetParameter =>
    state.netParameters.find((entry) => entry.parameterId === parameterId) ?? {
      parameterId,
      ...emptyValue(""),
    };

  const setEntry = (entry: AdHocNetParameter) => {
    const rest = state.netParameters.filter(
      (existing) => existing.parameterId !== entry.parameterId,
    );
    onChange({ ...state, netParameters: [...rest, entry] });
  };

  return (
    <SectionList>
      {context.netParameters.length > 0 ? (
        <Section
          title="Parameters"
          tooltip="Override a net parameter's value for this run. Empty keeps its default."
        >
          {context.netParameters.map((parameter) => {
            const entry = entryFor(parameter.id);
            return (
              <div key={parameter.id} className={parameterRowStyle}>
                <span className={parameterNameStyle}>{parameter.name}</span>
                <ValueEditor
                  label={`Value of ${parameter.name}`}
                  value={entry}
                  display={
                    entry.optimize
                      ? undefined
                      : entry.expression ||
                        `default (${parameter.defaultValue})`
                  }
                  optimizable={optimizable && parameter.type !== "boolean"}
                  integer={parameter.type === "integer"}
                  onChange={(value) => setEntry({ ...entry, ...value })}
                />
                {optimizable && parameter.type !== "boolean" ? (
                  <Toggle
                    size="xs"
                    aria-label={`Optimize ${parameter.name}`}
                    value={entry.optimize !== null}
                    onChange={(on) =>
                      setEntry({ ...entry, ...toggleAdHocOptimize(entry, on) })
                    }
                  />
                ) : null}
              </div>
            );
          })}
        </Section>
      ) : null}

      <Section
        title="Variables"
        tooltip="Named expressions usable in every value below. They replace scenario parameters in this form."
      >
        <VariableRows
          scopeLabel="Top-level variables"
          variables={state.variables}
          onChange={(variables) => onChange({ ...state, variables })}
          optimizable={optimizable}
        />
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
                  optimizable={optimizable}
                  onChange={(next) =>
                    onChange(updatePlace(state, place.id, context, () => next))
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
                  optimizable={optimizable}
                  onChange={(next) =>
                    onChange(updatePlace(state, place.id, context, () => next))
                  }
                />
              );
            }
            return null;
          })}
        </div>
      </Section>
    </SectionList>
  );
};
