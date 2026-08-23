/**
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
 */

import { use } from "react";

import { Button, Toggle } from "@hashintel/ds-components";
import { css } from "@hashintel/ds-helpers/css";
import {
  adHocSlotKey,
  adHocTargetLabel,
  getAdHocDocumentUri,
  synthesizeAdHocOptimization,
  toggleAdHocOptimize,
} from "@hashintel/petrinaut-core";

import { LanguageClientContext } from "../../../react/lsp/context";
import { Section, SectionList } from "../section";
import { AdHocFormContext } from "./form-context";
import { ColouredPlaceBlock, UncolouredPlaceBlock } from "./place-block";
import { emptyValue, placeStateFor, updatePlace } from "./state";
import { useAdHocLspSession } from "./use-ad-hoc-lsp-session";
import { ValueEditor } from "./value-editor";
import { VariableRows } from "./variable-rows";

import type { AdHocFormServices } from "./form-context";
import type {
  AdHocNetParameter,
  AdHocScenarioState,
  AdHocSlot,
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

const parameterValueStyle = css({
  flex: "1",
  minWidth: "[0]",
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
    onChange({ ...state, netParameters: [...rest, entry] });
  };

  const addTopLevelVariable = () => {
    const names = new Set(state.variables.map((variable) => variable.name));
    let ordinal = 1;
    while (names.has(`variable${ordinal}`)) {
      ordinal += 1;
    }
    onChange({
      ...state,
      variables: [
        ...state.variables,
        {
          name: `variable${ordinal}`,
          type: "real",
          expression: "0",
          optimize: null,
        },
      ],
    });
  };

  return (
    <AdHocFormContext value={services}>
      <SectionList>
        {context.netParameters.length > 0 ? (
          <Section
            title="Parameters"
            tooltip="Override a net parameter's value for this run. Empty keeps its default."
          >
            {context.netParameters.map((parameter) => {
              const entry = entryFor(parameter.id);
              const target = {
                kind: "netParameter" as const,
                parameterId: parameter.id,
              };
              return (
                <div key={parameter.id} className={parameterRowStyle}>
                  <span className={parameterNameStyle}>{parameter.name}</span>
                  <div className={parameterValueStyle}>
                    <ValueEditor
                      label={adHocTargetLabel(target, state, context)}
                      target={target}
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
                  </div>
                  {optimizable && parameter.type !== "boolean" ? (
                    <Toggle
                      size="xs"
                      aria-label={`Optimize ${parameter.name}`}
                      value={entry.optimize !== null}
                      onChange={(on) =>
                        setEntry({
                          ...entry,
                          ...toggleAdHocOptimize(entry, on),
                        })
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
          tooltip="Named values written scenario.<name> in every expression below. They stand in for scenario parameters."
        >
          <VariableRows
            scopeLabel="Top-level variables"
            placeId={null}
            variables={state.variables}
            onChange={(variables) => onChange({ ...state, variables })}
            optimizable={optimizable}
            formState={state}
            context={context}
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
                    optimizable={optimizable}
                    formState={state}
                    context={context}
                    onChange={(next) =>
                      onChange(
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
                    optimizable={optimizable}
                    formState={state}
                    context={context}
                    onChange={(next) =>
                      onChange(
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
    </AdHocFormContext>
  );
};
