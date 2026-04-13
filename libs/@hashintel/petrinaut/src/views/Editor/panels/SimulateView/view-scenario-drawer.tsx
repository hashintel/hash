import { css } from "@hashintel/ds-helpers/css";
import { useStore } from "@tanstack/react-form";
import { use } from "react";

import { Button } from "../../../../components/button";
import { Drawer } from "../../../../components/drawer";
import type { Color, Scenario } from "../../../../core/types/sdcpn";
import { LanguageClientContext } from "../../../../lsp/context";
import { SDCPNContext } from "../../../../state/sdcpn-context";
import {
  ScenarioFormBody,
  type ScenarioFormInstance,
  type ScenarioFormState,
  useScenarioForm,
} from "./scenario-form";
import { hasScenarioLspErrors } from "./scenario-lsp";

// Override default Drawer.Body padding — vertical padding on the scroll
// container creates a gap above sticky section headers.
const bodyStyle = css({
  paddingY: "[0]",
});

// -- Defaults -----------------------------------------------------------------

let nextKey = 0;

function buildDefaultsFromScenario(scenario: Scenario): ScenarioFormState {
  return {
    name: scenario.name,
    description: scenario.description ?? "",
    scenarioParams: scenario.scenarioParameters.map((p) => ({
      ...p,
      _key: nextKey++,
    })),
    parameterOverrides: scenario.parameterOverrides,
    initialTokenCounts: scenario.initialState,
    initialTokenData: {},
    showAllPlaces: false,
    initialStateAsCode: false,
    initialStateCode: "",
  };
}

// -- Footer -------------------------------------------------------------------

const ViewScenarioFooter = ({
  form,
  onClose,
}: {
  form: ScenarioFormInstance;
  onClose: () => void;
}) => {
  const canSubmit = useStore(form.store, (state) => state.canSubmit);
  const isSubmitting = useStore(form.store, (state) => state.isSubmitting);
  const formErrors = useStore(form.store, (state) => state.errors);

  const { diagnosticsByUri } = use(LanguageClientContext);
  const hasLspErrors = hasScenarioLspErrors(diagnosticsByUri);

  const formError = formErrors.find((e) => typeof e === "string") as
    | string
    | undefined;
  const canSave = canSubmit && !hasLspErrors && !isSubmitting;

  return (
    <Drawer.Footer>
      <Button
        variant="secondary"
        colorScheme="neutral"
        size="sm"
        onClick={onClose}
      >
        Close
      </Button>
      <Button
        variant="primary"
        colorScheme="neutral"
        size="sm"
        disabled={!canSave}
        tooltip={
          formError ??
          (hasLspErrors
            ? "Fix the errors in the scenario expressions before saving."
            : undefined)
        }
        onClick={() => {
          void form.handleSubmit();
        }}
      >
        Save
      </Button>
    </Drawer.Footer>
  );
};

// -- Inner content (remounts when scenario changes via `key`) -----------------

const ViewScenarioContent = ({
  scenario,
  onClose,
}: {
  scenario: Scenario;
  onClose: () => void;
}) => {
  const { petriNetDefinition } = use(SDCPNContext);

  const typesById = new Map<string, Color>();
  for (const type of petriNetDefinition.types) {
    typesById.set(type.id, type);
  }

  // Names of OTHER scenarios — exclude the one being edited so it can keep
  // its current name without triggering the "already exists" error.
  const existingScenarioNames = new Set(
    (petriNetDefinition.scenarios ?? [])
      .filter((s) => s.id !== scenario.id)
      .map((s) => s.name),
  );

  // Build defaults once from the scenario prop (component remounts via `key`
  // when scenario.id changes, so this is effectively re-evaluated on switch).
  const form = useScenarioForm(
    buildDefaultsFromScenario(scenario),
    (value) => {
      // TODO: persist scenario edits
      // eslint-disable-next-line no-console
      console.log("save scenario", scenario.id, value);
    },
    { existingScenarioNames },
  );

  return (
    <>
      <Drawer.Card onClose={onClose}>
        <Drawer.Header>{scenario.name}</Drawer.Header>
        <Drawer.Body className={bodyStyle}>
          <ScenarioFormBody
            form={form}
            parameters={petriNetDefinition.parameters}
            places={petriNetDefinition.places}
            typesById={typesById}
            idPrefix="view-"
          />
        </Drawer.Body>
      </Drawer.Card>
      <ViewScenarioFooter form={form} onClose={onClose} />
    </>
  );
};

// -- Component ----------------------------------------------------------------

interface ViewScenarioDrawerProps {
  open: boolean;
  onClose: () => void;
  scenario: Scenario | undefined;
}

export const ViewScenarioDrawer = ({
  open,
  onClose,
  scenario,
}: ViewScenarioDrawerProps) => (
  <Drawer.Root open={open} onClose={onClose}>
    {scenario ? (
      <ViewScenarioContent
        key={scenario.id}
        scenario={scenario}
        onClose={onClose}
      />
    ) : null}
  </Drawer.Root>
);
