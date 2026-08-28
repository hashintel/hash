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
 * render it with `selection` "none"; optimization experiments render it
 * with "optimize", which grows an Optimize toggle on every value slot; the
 * scenario creation form renders it with "expose", which offers a
 * "Scenario Parameter" toggle on each top-level Variable — the saved
 * scenario exposes those Variables as its tunable parameters.
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

import { use, useEffect, useRef, useState } from "react";

import { css } from "@hashintel/ds-helpers/css";
import {
  adHocPlaceStateFor,
  adHocSlotKey,
  getAdHocDocumentUri,
  synthesizeAdHocOptimization,
} from "@hashintel/petrinaut-core";

import { LanguageClientContext } from "../../../react/lsp/context";
import { Section, SectionList } from "../section";
import { computeAdHocHighlight } from "./dependency-highlight";
import { AdHocFormContext } from "./form-context";
import {
  FormNavigationContext,
  useFormNavigationRegistry,
  useNavigationHeader,
} from "./navigation/use-form-navigation";
import { ParameterRows } from "./parameter-rows";
import { ColouredPlaceBlock, UncolouredPlaceBlock } from "./place-block";
import { useAdHocLspSession } from "./use-ad-hoc-lsp-session";
import { useAdHocFormHistory } from "./use-form-history";
import { VariableRows } from "./variable-rows";

import type { AdHocFocusTarget } from "./dependency-highlight";
import type { AdHocFormSelection, AdHocFormServices } from "./form-context";
import type {
  AdHocScenarioState,
  AdHocSlot,
  AdHocSynthesisContext,
} from "@hashintel/petrinaut-core";

const placesListStyle = css({
  display: "flex",
  flexDirection: "column",
  gap: "3",
});

// The bare layout: the exposed groups stacked without section chrome.
const bareListStyle = css({
  display: "flex",
  flexDirection: "column",
  gap: "4",
});

export interface AdHocScenarioFormProps {
  state: AdHocScenarioState;
  onChange: (state: AdHocScenarioState) => void;
  context: AdHocSynthesisContext;
  /** What selecting a value means; "none" hides the toggles. */
  selection: AdHocFormSelection;
  /**
   * Whether the Variables section is offered. Embeddings that provide no
   * scenario Variables (quick simulation's Simulation Settings) turn it
   * off; an expression referencing `scenario.<name>` then fails as unknown,
   * exactly as it should. The Parameters section hides itself the same way
   * when the context carries no net parameters.
   */
  withVariables?: boolean;
  /**
   * Render the exposed groups without the collapsible section chrome — the
   * host supplies its own headings. For embedding inside a panel that
   * already has a heading grammar (Simulation Settings).
   */
  bare?: boolean;
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
  selection,
  withVariables = true,
  bare = false,
}) => {
  const sessionId = useAdHocLspSession(state);
  const { diagnosticsByUri, requestFormatExpression } = use(
    LanguageClientContext,
  );
  // Every edit below is an action dispatched through the history: the pure
  // reducer in petrinaut-core computes the next state, and Cmd/Ctrl+Z
  // anywhere in the form (open text fields excepted — those own their own
  // undo) moves a cursor over the recorded snapshots.
  const { dispatch, handleKeyDown } = useAdHocFormHistory(
    state,
    context,
    onChange,
  );

  // Zones (grids, section headers, place headers) register here; arrow moves
  // past a zone's edge continue into the next one in document order.
  const navigation = useFormNavigationRegistry();

  // Escape pressed while focus is inside the form never reaches the host:
  // the drawers/dialogs the form embeds in close on Escape via a document
  // capture listener (Zag's dismissable), so a cell-focused Escape after
  // closing an editor would close the whole drawer. The listener sits on
  // `window` capture — above document — and swallows Escape when the event
  // originates inside the form. Inner editors and menus portal outside the
  // form root, so their own Escape handling is untouched.
  const rootRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const root = rootRef.current;
      if (
        event.key !== "Escape" ||
        !root ||
        !(event.target instanceof Element) ||
        !root.contains(event.target)
      ) {
        return;
      }
      // An open Ark select (the type column) dismisses itself through the
      // Zag layer stack, which already spares the host drawer. Scoped to
      // select triggers: plain expanded disclosures (place headers, section
      // headers) are NOT layers — letting their Escape through would reach
      // the host.
      if (
        event.target.closest(
          '[data-scope="select"][data-part="trigger"][aria-expanded="true"]',
        )
      ) {
        return;
      }
      event.preventDefault();
      // Not stopImmediatePropagation: in-form editors (the name cell) and
      // the value-editor overlay listen on window capture too — registered
      // after this one, they still see the event and peel their own layer.
      event.stopPropagation();
    };
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, []);

  // The focused value drives the dependency highlight: the rows it reads,
  // and — for a Variable or Parameter — the cells that read it.
  const [focusedValue, setFocusedValue] = useState<AdHocFocusTarget | null>(
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
    dispatch,
    synthesisContext: context,
    selection,
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
    formatExpression: requestFormatExpression,
    dense: bare,
  };

  const parameterRows =
    context.netParameters.length > 0 ? (
      <ParameterRows entries={state.netParameters} />
    ) : null;

  const variableRows = withVariables ? (
    <VariableRows
      scopeLabel="Top-level variables"
      placeId={null}
      variables={state.variables}
    />
  ) : null;

  const placesList = (
    <div className={placesListStyle}>
      {context.places.map((place) => {
        const placeState = adHocPlaceStateFor(state, context, place.id);
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
            />
          );
        }
        if (placeState.kind === "uncoloured") {
          return (
            <UncolouredPlaceBlock
              key={place.id}
              place={place}
              state={placeState}
            />
          );
        }
        return null;
      })}
    </div>
  );

  return (
    <AdHocFormContext value={services}>
      <FormNavigationContext value={navigation}>
        {/* Undo/redo listens in the capture phase, so it sees keys before any
          cell handler; open text fields and Monaco pass through untouched. */}
        <div ref={rootRef} onKeyDownCapture={handleKeyDown}>
          {bare ? (
            // The host owns the headings; the groups stack plainly.
            // Variables lead: net parameter overrides may read them.
            <div className={bareListStyle}>
              {variableRows}
              {parameterRows}
              {placesList}
            </div>
          ) : (
            <SectionList>
              {variableRows ? (
                <NavigableSection
                  title="Variables"
                  tooltip="Named values written scenario.<name> in every expression below. They stand in for scenario parameters."
                >
                  {variableRows}
                </NavigableSection>
              ) : null}

              {parameterRows ? (
                <NavigableSection
                  title="Parameters"
                  tooltip="Override a net parameter's value for this run. Empty keeps its default. Overrides may read the Variables above."
                >
                  {parameterRows}
                </NavigableSection>
              ) : null}

              <NavigableSection
                title="Initial state"
                tooltip="Token counts and values per place. Every value is an expression."
              >
                {placesList}
              </NavigableSection>
            </SectionList>
          )}
        </div>
      </FormNavigationContext>
    </AdHocFormContext>
  );
};
