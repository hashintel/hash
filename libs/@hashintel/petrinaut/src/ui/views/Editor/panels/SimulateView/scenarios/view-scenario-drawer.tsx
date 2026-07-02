import { useStore } from "@tanstack/react-form";
import { use } from "react";

import { Button } from "@hashintel/ds-components";
import {
  scenarioSchema,
  type Color,
  type Scenario,
  type TokenAttributeValue,
} from "@hashintel/petrinaut-core";

import { usePetrinautMutations } from "../../../../../../react";
import { LanguageClientContext } from "../../../../../../react/lsp/context";
import { SDCPNContext } from "../../../../../../react/state/sdcpn-context";
import { Drawer } from "../../../../../components/drawer";
import { DrawerErrorDisplay } from "../drawer-error-display";
import {
  ScenarioFormBody,
  type ScenarioFormInstance,
  type ScenarioFormState,
  useScenarioForm,
} from "./scenario-form";
import { summarizeScenarioLspErrors } from "./scenario-lsp";
import { buildScenarioFromFormState } from "./scenario-mapping";

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
    initialTokenCounts:
      scenario.initialState.type === "per_place"
        ? (Object.fromEntries(
            Object.entries(scenario.initialState.content).filter(
              (entry): entry is [string, string] =>
                typeof entry[1] === "string",
            ),
          ) as Record<string, string>)
        : {},
    initialTokenData:
      scenario.initialState.type === "per_place"
        ? (Object.fromEntries(
            Object.entries(scenario.initialState.content).filter(
              (entry): entry is [string, TokenAttributeValue[][]] =>
                Array.isArray(entry[1]),
            ),
          ) as Record<string, TokenAttributeValue[][]>)
        : {},
    showAllPlaces: false,
    initialStateAsCode: scenario.initialState.type === "code",
    initialStateCode:
      scenario.initialState.type === "code"
        ? scenario.initialState.content
        : "",
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
  const isDefaultValue = useStore(form.store, (state) => state.isDefaultValue);
  const formErrors = useStore(form.store, (state) => state.errors);

  const { diagnosticsByUri } = use(LanguageClientContext);
  const { count: lspErrorCount, firstMessage: firstLspMessage } =
    summarizeScenarioLspErrors(diagnosticsByUri);
  const hasLspErrors = lspErrorCount > 0;

  const formError = formErrors.find((e) => typeof e === "string") as
    | string
    | undefined;
  const hasErrors = !!formError || hasLspErrors;
  const totalErrorCount = (formError ? 1 : 0) + lspErrorCount;
  const firstError = formError ?? firstLspMessage;
  const canSave = canSubmit && !hasErrors && !isSubmitting && !isDefaultValue;

  return (
    <Drawer.Footer>
      <DrawerErrorDisplay count={totalErrorCount} firstMessage={firstError} />
      <Button variant="subtle" tone="neutral" size="sm" onClick={onClose}>
        Close
      </Button>
      <Button
        variant="solid"
        tone="neutral"
        size="sm"
        disabled={!canSave}
        tooltip={
          formError ??
          (hasLspErrors
            ? "Fix the errors in the scenario expressions before saving."
            : isDefaultValue
              ? "No changes to save."
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
  const { extensions, petriNetDefinition } = use(SDCPNContext);
  const { updateScenario } = usePetrinautMutations();

  const typesById = new Map<string, Color>();
  if (extensions.colors) {
    for (const type of petriNetDefinition.types) {
      typesById.set(type.id, type);
    }
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
      const updated = buildScenarioFromFormState(value, scenario.id);
      const result = scenarioSchema.safeParse(updated);
      if (!result.success) {
        return;
      }
      updateScenario({
        scenarioId: scenario.id,
        update: {
          name: result.data.name,
          description: result.data.description,
          scenarioParameters: result.data.scenarioParameters,
          parameterOverrides: result.data.parameterOverrides,
          initialState: result.data.initialState,
        },
      });
      onClose();
    },
    { existingScenarioNames },
  );

  return (
    <>
      <Drawer.Card onClose={onClose}>
        <Drawer.Header>{scenario.name}</Drawer.Header>
        <Drawer.Body>
          <ScenarioFormBody
            form={form}
            parameters={
              extensions.parameters ? petriNetDefinition.parameters : []
            }
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
