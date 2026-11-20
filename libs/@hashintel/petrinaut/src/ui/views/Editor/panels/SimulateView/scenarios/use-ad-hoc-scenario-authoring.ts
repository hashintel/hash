import { use, useState } from "react";

import {
  adHocExposedParameterIdentifier,
  EMPTY_AD_HOC_STATE,
  scenarioSchema,
  synthesizeAdHocScenario,
} from "@hashintel/petrinaut-core";

import { LanguageClientContext } from "../../../../../../react/lsp/context";
import { SDCPNContext } from "../../../../../../react/state/sdcpn-context";
import { summarizeAdHocLspErrors } from "./ad-hoc-scenario-authoring/ad-hoc-lsp-errors";
import { validateScenarioName } from "./ad-hoc-scenario-authoring/validate-scenario-name";

import type {
  AdHocScenarioState,
  Scenario,
  ScenarioParameter,
} from "@hashintel/petrinaut-core";

export interface AdHocScenarioDraft {
  name: string;
  description: string;
  state: AdHocScenarioState;
}

export interface UseAdHocScenarioAuthoringOptions {
  initial?: Partial<AdHocScenarioDraft>;
  /** Names of other scenarios; the draft's name must not match any. */
  existingScenarioNames: ReadonlySet<string>;
  /**
   * A code-mode initial state the form cannot show as blocks. Kept verbatim
   * on save and shown read-only in the Initial state slot; the code reads
   * `scenario.<identifier>` for each of `parameters`, so those Variables
   * must stay exposed under the same name and type.
   */
  code?: { body: string; parameters: readonly ScenarioParameter[] };
}

/**
 * The stored parameters the code reads that the draft no longer exposes
 * under the same identifier and type — each one an error, since the saved
 * code would read a `scenario.<identifier>` the scenario no longer declares.
 */
const missingCodeParameterErrors = (
  state: AdHocScenarioState,
  parameters: readonly ScenarioParameter[],
): string[] =>
  parameters
    .filter(
      (parameter) =>
        !state.variables.some(
          (variable) =>
            variable.exposed === true &&
            variable.type === parameter.type &&
            adHocExposedParameterIdentifier(variable.name) ===
              parameter.identifier,
        ),
    )
    .map(
      ({ identifier }) =>
        `Variable "${identifier}" is read by the scenario's code as scenario.${identifier}; keep it exposed with that name and type.`,
    );

/**
 * A `code` scenario persists no form state, only the synthesized parameters
 * (the exposed Variables): a Variable left unexposed would be inlined into
 * the overrides and vanish on the next open, so each one is an error.
 */
const unexposedCodeVariableErrors = (state: AdHocScenarioState): string[] =>
  state.variables
    .filter((variable) => variable.exposed !== true)
    .map(
      ({ name }) =>
        `Variable "${name}" cannot be kept with code-defined initial state; turn Scenario Parameter on or delete it.`,
    );

/**
 * The draft state plus everything the footer needs: the error summary
 * (name validation, synthesis errors, the code's parameter checks, this
 * form's LSP diagnostics) and `scenarioToSave`, which derives the persisted
 * shape from the draft and holds it against the persistence schema.
 *
 * Saving persists the form state itself (`initialState.type: "adhoc"`) and
 * derives `scenarioParameters` and `parameterOverrides` from it through
 * `synthesizeAdHocScenario` — those stay the compiler's inputs, so every
 * other consumer of the saved scenario works unchanged.
 */
export function useAdHocScenarioAuthoring({
  initial,
  existingScenarioNames,
  code,
}: UseAdHocScenarioAuthoringOptions) {
  const { extensions, petriNetDefinition } = use(SDCPNContext);
  const { diagnosticsByUri } = use(LanguageClientContext);

  const [name, setName] = useState(initial?.name ?? "");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [state, setState] = useState<AdHocScenarioState>(
    initial?.state ?? EMPTY_AD_HOC_STATE,
  );
  // Owned here (not generated inside the form) so the footer can address
  // exactly this form's diagnostics.
  const [sessionId] = useState(() => crypto.randomUUID());
  // A schema rejection after a passing form would otherwise be a silent
  // no-op click; the footer shows it instead.
  const [saveError, setSaveError] = useState<string | null>(null);

  const context = {
    netParameters: extensions.parameters ? petriNetDefinition.parameters : [],
    places: petriNetDefinition.places,
    types: extensions.colors ? petriNetDefinition.types : [],
  };

  const nameError = validateScenarioName(name, existingScenarioNames);
  const synthesized = synthesizeAdHocScenario(state, context);
  const synthesisErrors = synthesized.ok ? [] : synthesized.errors;
  const codeParameterErrors = code
    ? [
        ...missingCodeParameterErrors(state, code.parameters),
        ...unexposedCodeVariableErrors(state),
      ]
    : [];
  const { count: lspErrorCount, firstMessage: firstLspMessage } =
    summarizeAdHocLspErrors(diagnosticsByUri, sessionId);

  const errorCount =
    (nameError ? 1 : 0) +
    synthesisErrors.length +
    codeParameterErrors.length +
    lspErrorCount;
  const firstError =
    nameError ??
    synthesisErrors[0]?.message ??
    codeParameterErrors[0] ??
    firstLspMessage;

  /** The scenario to persist, or null: the footer then says why. */
  const scenarioToSave = (id: string) => {
    if (!synthesized.ok || nameError || codeParameterErrors.length > 0) {
      return null;
    }
    const result = scenarioSchema.safeParse({
      id,
      name: name.trim(),
      description: description.trim() === "" ? undefined : description.trim(),
      // Derived from the form state; the state itself stays the authoring
      // source of truth and round-trips through the edit drawer.
      scenarioParameters: synthesized.scenario.scenarioParameters,
      parameterOverrides: synthesized.scenario.parameterOverrides,
      initialState:
        code === undefined
          ? { type: "adhoc", content: state }
          : { type: "code", content: code.body },
    } satisfies Scenario);
    if (!result.success) {
      setSaveError(
        result.error.issues[0]?.message ?? "The scenario failed validation.",
      );
      return null;
    }
    return result.data;
  };

  return {
    name,
    setName,
    description,
    setDescription,
    state,
    setState,
    sessionId,
    context,
    code: code?.body,
    nameError,
    errorCount,
    firstError,
    saveError,
    canSave: errorCount === 0,
    scenarioToSave,
  };
}

export type AdHocScenarioAuthoring = ReturnType<
  typeof useAdHocScenarioAuthoring
>;
