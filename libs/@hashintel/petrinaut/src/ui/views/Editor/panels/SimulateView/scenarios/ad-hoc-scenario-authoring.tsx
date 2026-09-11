/**
 * The authoring surface of the scenario drawers: name + description above
 * the Initial State + Parameters form in expose mode — each top-level
 * Variable offers a "Scenario Parameter" toggle, and the exposed Variables
 * become the saved scenario's tunable parameters. The same body edits a
 * scenario stored in any format: a scenario that defines its initial state
 * as code shows that code read-only in the Initial state slot and keeps it
 * verbatim on save.
 *
 * Saving persists the form state itself (`initialState.type: "adhoc"`) and
 * derives `scenarioParameters` and `parameterOverrides` from it through
 * `synthesizeAdHocScenario` — those stay the compiler's inputs, so every
 * other consumer of the saved scenario works unchanged.
 */

import { use, useState } from "react";

import { Drawer, Form, TextArea, TextInput } from "@hashintel/ds-components";
import { css } from "@hashintel/ds-helpers/css";
import {
  adHocExposedParameterIdentifier,
  EMPTY_AD_HOC_STATE,
  synthesizeAdHocScenario,
} from "@hashintel/petrinaut-core";

import { LanguageClientContext } from "../../../../../../react/lsp/context";
import { SDCPNContext } from "../../../../../../react/state/sdcpn-context";
import {
  AdHocScenarioForm,
  FormLayoutColumn,
} from "../../../../../components/ad-hoc-scenario-form/ad-hoc-scenario-form";
import { Section, SectionList } from "../../../../../components/section";
import { CodeEditor } from "../../../../../monaco/code-editor";
import { summarizeAdHocLspErrors } from "./ad-hoc-scenario-authoring/ad-hoc-lsp-errors";
import { validateScenarioName } from "./ad-hoc-scenario-authoring/validate-scenario-name";

import type {
  AdHocScenarioState,
  Scenario,
  ScenarioParameter,
} from "@hashintel/petrinaut-core";
import type { ReactNode } from "react";

const fieldsStyle = css({
  display: "flex",
  flexDirection: "column",
  gap: "4",
  marginBottom: "5",
});

const codeNoteStyle = css({
  fontSize: "xs",
  color: "neutral.s90",
  margin: "[0]",
  marginBottom: "3",
});

/** Fixed, so Monaco's lazy load moves nothing around the code slot. */
const codeSlotHeight = "300px";

export const codeScenarioNotice =
  "This scenario defines its initial state as code, shown here read-only. Only Variables marked Scenario Parameter are kept with it, each as its computed default. Edit the code from the AI assistant or the net file, or recreate the scenario from the form (a Dynamic row builds many tokens from one count).";

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
 * form's LSP diagnostics) and `buildScenario`, which derives the persisted
 * shape from the draft.
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

  const buildScenario = (id: string): Scenario | null => {
    if (!synthesized.ok || nameError || codeParameterErrors.length > 0) {
      return null;
    }
    return {
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
    };
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
    canSave: errorCount === 0,
    buildScenario,
  };
}

export type AdHocScenarioAuthoring = ReturnType<
  typeof useAdHocScenarioAuthoring
>;

/**
 * The drawer body: name, description, an optional note beneath them, and
 * the expose-mode form. A draft carrying code lays the form out itself:
 * Variables and Parameters as sections, the code read-only where the
 * Initial state blocks would sit.
 */
export const AdHocScenarioAuthoringBody: React.FC<{
  authoring: AdHocScenarioAuthoring;
  children?: ReactNode;
}> = ({ authoring, children }) => {
  const { code } = authoring;
  return (
    <Drawer.Body className={css({ paddingTop: "[0]" })}>
      <div className={fieldsStyle}>
        <Form.Field
          label="Scenario name"
          size="sm"
          errors={
            authoring.nameError && authoring.name !== ""
              ? [authoring.nameError]
              : undefined
          }
        >
          <TextInput
            size="sm"
            value={authoring.name}
            onChange={authoring.setName}
            invalid={authoring.nameError !== undefined && authoring.name !== ""}
          />
        </Form.Field>
        <Form.Field label="Description" size="sm">
          <TextArea
            className={css({ minHeight: "[80px]" })}
            size="sm"
            value={authoring.description}
            onChange={authoring.setDescription}
          />
        </Form.Field>
        {children}
      </div>
      <AdHocScenarioForm
        state={authoring.state}
        onChange={authoring.setState}
        context={authoring.context}
        selection="expose"
        sessionId={authoring.sessionId}
        renderLayout={
          code === undefined
            ? undefined
            : ({ variables, parameters }) => (
                <FormLayoutColumn>
                  <SectionList>
                    <Section title="Variables">{variables}</Section>
                    {parameters ? (
                      <Section title="Parameters">{parameters}</Section>
                    ) : null}
                    <Section title="Initial state">
                      <p className={codeNoteStyle}>{codeScenarioNotice}</p>
                      <CodeEditor
                        language="typescript"
                        value={code}
                        options={{ readOnly: true }}
                        height={codeSlotHeight}
                      />
                    </Section>
                  </SectionList>
                </FormLayoutColumn>
              )
        }
      />
    </Drawer.Body>
  );
};
