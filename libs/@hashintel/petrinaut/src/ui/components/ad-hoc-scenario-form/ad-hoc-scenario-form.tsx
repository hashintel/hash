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
 * a phantom trailing row, grids and collapsible section/place headers chain
 * into one vertical walk (the zone registry in `use-form-navigation`), and
 * Cmd/Ctrl+Z / Shift+Cmd/Ctrl+Z walk a form-level undo history (open text
 * fields keep their own). Focusing a value highlights the rows it reads and
 * the cells that read it (`dependency-highlight`).
 */

import { use, useState } from "react";

import { css } from "@hashintel/ds-helpers/css";
import {
  adHocSlotKey,
  getAdHocDocumentUri,
  synthesizeAdHocOptimization,
} from "@hashintel/petrinaut-core";

import { LanguageClientContext } from "../../../react/lsp/context";
import { Section, SectionList } from "../section";
import { computeAdHocHighlight } from "./dependency-highlight";
import { AdHocFormContext } from "./form-context";
import { ParameterRows } from "./parameter-rows";
import { ColouredPlaceBlock, UncolouredPlaceBlock } from "./place-block";
import { placeStateFor, updatePlace } from "./state";
import { useAdHocLspSession } from "./use-ad-hoc-lsp-session";
import { useAdHocFormHistory } from "./use-form-history";
import {
  FormNavigationContext,
  useFormNavigationRegistry,
  useNavigationHeader,
} from "./use-form-navigation";
import { VariableRows } from "./variable-rows";

import type { AdHocFormServices } from "./form-context";
import type {
  AdHocNetParameter,
  AdHocScenarioState,
  AdHocSlot,
  AdHocSynthesisContext,
  AdHocValueTarget,
} from "@hashintel/petrinaut-core";

const placesListStyle = css({
  display: "flex",
  flexDirection: "column",
  gap: "5",
});

export interface AdHocScenarioFormProps {
  state: AdHocScenarioState;
  onChange: (state: AdHocScenarioState) => void;
  context: AdHocSynthesisContext;
  /** Grows the Optimize selection on every value slot. */
  optimizable: boolean;
}

/**
 * A Section that participates in the form's keyboard walk: its collapse
 * trigger is a navigation stop, Left collapses, Right expands.
 */
const NavigableSection: React.FC<{
  title: string;
  tooltip: string;
  children: React.ReactNode;
}> = ({ title, tooltip, children }) => {
  const [open, setOpen] = useState(true);
  const header = useNavigationHeader({
    collapse: () => setOpen(false),
    expand: () => setOpen(true),
  });
  return (
    <Section
      title={title}
      tooltip={tooltip}
      collapsible
      unmountOnCollapse
      open={open}
      onOpenChange={setOpen}
      triggerRef={header.attach}
      onTriggerKeyDown={header.onHeaderKeyDown}
    >
      {children}
    </Section>
  );
};

export const AdHocScenarioForm: React.FC<AdHocScenarioFormProps> = ({
  state,
  onChange,
  context,
  optimizable,
}) => {
  const sessionId = useAdHocLspSession(state);
  const { diagnosticsByUri } = use(LanguageClientContext);
  // Every edit below routes through `change`, so Cmd/Ctrl+Z anywhere in the
  // form (open text fields excepted — those own their own undo) walks the
  // whole form's history.
  const { change, handleKeyDown } = useAdHocFormHistory(state, onChange);

  // Zones (grids, section headers, place headers) register here; arrow moves
  // past a zone's edge continue into the next one in document order.
  const navigation = useFormNavigationRegistry();

  // The focused value drives the dependency highlight: the rows it reads,
  // and — for a Variable or Parameter — the cells that read it.
  const [focusedValue, setFocusedValue] = useState<AdHocValueTarget | null>(
    null,
  );
  const highlight = computeAdHocHighlight(state, context, focusedValue);

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
    highlight,
    setFocusedValue,
  };

  const setEntry = (entry: AdHocNetParameter) => {
    const rest = state.netParameters.filter(
      (existing) => existing.parameterId !== entry.parameterId,
    );
    change({ ...state, netParameters: [...rest, entry] });
  };

  return (
    <AdHocFormContext value={services}>
      <FormNavigationContext value={navigation}>
        {/* Undo/redo listens in the capture phase, so it sees keys before any
          cell handler; open text fields and Monaco pass through untouched. */}
        <div onKeyDownCapture={handleKeyDown}>
          <SectionList>
            {context.netParameters.length > 0 ? (
              <NavigableSection
                title="Parameters"
                tooltip="Override a net parameter's value for this run. Empty keeps its default."
              >
                <ParameterRows
                  entries={state.netParameters}
                  onEntryChange={setEntry}
                />
              </NavigableSection>
            ) : null}

            <NavigableSection
              title="Variables"
              tooltip="Named values written scenario.<name> in every expression below. They stand in for scenario parameters."
            >
              <VariableRows
                scopeLabel="Top-level variables"
                placeId={null}
                variables={state.variables}
                onChange={(variables) => change({ ...state, variables })}
              />
            </NavigableSection>

            <NavigableSection
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
            </NavigableSection>
          </SectionList>
        </div>
      </FormNavigationContext>
    </AdHocFormContext>
  );
};
