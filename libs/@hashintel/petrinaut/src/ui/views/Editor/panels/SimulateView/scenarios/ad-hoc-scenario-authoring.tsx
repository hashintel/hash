/**
 * The ad-hoc authoring surface of the scenario drawers (behind the Ad-hoc
 * scenarios setting): name + description above the ad-hoc Initial State +
 * Parameters form in expose mode — each top-level Variable offers a
 * "Scenario Parameter" toggle, and the exposed Variables become the saved
 * scenario's tunable parameters. One mode only: no "Define as code" here.
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
  EMPTY_AD_HOC_STATE,
  synthesizeAdHocScenario,
} from "@hashintel/petrinaut-core";

import { LanguageClientContext } from "../../../../../../react/lsp/context";
import { SDCPNContext } from "../../../../../../react/state/sdcpn-context";
import { AdHocScenarioForm } from "../../../../../components/ad-hoc-scenario-form/ad-hoc-scenario-form";
import { validateScenarioName } from "./scenario-form";
import { summarizeScenarioLspErrors } from "./scenario-lsp";

import type { AdHocScenarioState, Scenario } from "@hashintel/petrinaut-core";

const fieldsStyle = css({
  display: "flex",
  flexDirection: "column",
  gap: "4",
  marginBottom: "5",
});

export interface AdHocScenarioDraft {
  name: string;
  description: string;
  state: AdHocScenarioState;
}

export interface UseAdHocScenarioAuthoringOptions {
  initial?: Partial<AdHocScenarioDraft>;
  /** Names of other scenarios; the draft's name must not match any. */
  existingScenarioNames: ReadonlySet<string>;
}

/**
 * The draft state plus everything the footer needs: the error summary
 * (name validation, synthesis errors, this form's LSP diagnostics) and
 * `buildScenario`, which derives the persisted shape from the draft.
 */
export function useAdHocScenarioAuthoring({
  initial,
  existingScenarioNames,
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
  const { count: lspErrorCount, firstMessage: firstLspMessage } =
    summarizeScenarioLspErrors(diagnosticsByUri, {
      adHocSessionId: sessionId,
    });

  const errorCount =
    (nameError ? 1 : 0) + synthesisErrors.length + lspErrorCount;
  const firstError =
    nameError ?? synthesisErrors[0]?.message ?? firstLspMessage;

  const buildScenario = (id: string): Scenario | null => {
    if (!synthesized.ok || nameError) {
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
      initialState: { type: "adhoc", content: state },
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

/** The drawer body: name, description, and the expose-mode ad-hoc form. */
export const AdHocScenarioAuthoringBody: React.FC<{
  authoring: AdHocScenarioAuthoring;
}> = ({ authoring }) => (
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
    </div>
    <AdHocScenarioForm
      state={authoring.state}
      onChange={authoring.setState}
      context={authoring.context}
      selection="expose"
      sessionId={authoring.sessionId}
    />
  </Drawer.Body>
);
