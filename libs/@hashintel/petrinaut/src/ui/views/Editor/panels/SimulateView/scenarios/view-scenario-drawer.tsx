import { use, useState } from "react";

import { Button, Drawer } from "@hashintel/ds-components";
import { css } from "@hashintel/ds-helpers/css";
import {
  adHocStateFromScenario,
  scenarioSchema,
  type Scenario,
} from "@hashintel/petrinaut-core";

import { usePetrinautMutations } from "../../../../../../react";
import { SDCPNContext } from "../../../../../../react/state/sdcpn-context";
import { DrawerErrorDisplay } from "../drawer-error-display";
import {
  AdHocScenarioAuthoringBody,
  useAdHocScenarioAuthoring,
} from "./ad-hoc-scenario-authoring";

const migrationNoteStyle = css({
  fontSize: "xs",
  color: "neutral.s90",
  margin: "[0]",
});

export const perPlaceMigrationNote =
  "Saving stores this scenario in the form's format.";

/**
 * Editing a saved scenario, whatever format stores it: the expose-mode form
 * seeded through `adHocStateFromScenario`. A scenario stored per place
 * opens converted and is rewritten in the form's format only when the user
 * saves; a scenario that defines its initial state as code keeps that code
 * verbatim and edits its name, description, Variables and Parameters here.
 * Remounts through `key` when the scenario changes.
 */
const ViewScenarioContent = ({
  scenario,
  onClose,
}: {
  scenario: Scenario;
  onClose: () => void;
}) => {
  const { extensions, petriNetDefinition } = use(SDCPNContext);
  const { updateScenario } = usePetrinautMutations();
  // Names of the other scenarios, so this one can keep its current name.
  const existingScenarioNames = new Set(
    (petriNetDefinition.scenarios ?? [])
      .filter((candidate) => candidate.id !== scenario.id)
      .map((candidate) => candidate.name),
  );
  // A schema rejection after a passing form would otherwise be a silent
  // no-op click; surface it in the footer instead.
  const [saveError, setSaveError] = useState<string | null>(null);

  const source = adHocStateFromScenario(scenario, {
    places: petriNetDefinition.places,
    types: extensions.colors ? petriNetDefinition.types : [],
  });
  const authoring = useAdHocScenarioAuthoring({
    initial: {
      name: scenario.name,
      description: scenario.description ?? "",
      state: source.state,
    },
    existingScenarioNames,
    ...(source.kind === "code"
      ? {
          code: {
            body: source.code,
            parameters: scenario.scenarioParameters,
          },
        }
      : {}),
  });

  const save = () => {
    const updated = authoring.buildScenario(scenario.id);
    if (!updated) {
      return;
    }
    const result = scenarioSchema.safeParse(updated);
    if (!result.success) {
      setSaveError(
        result.error.issues[0]?.message ?? "The scenario failed validation.",
      );
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
  };

  return (
    <Drawer showBackdrop={false} onClose={onClose} swapKey="scenario">
      <Drawer.Header title={scenario.name} />
      <AdHocScenarioAuthoringBody authoring={authoring}>
        {source.kind === "per_place" ? (
          <p className={migrationNoteStyle}>{perPlaceMigrationNote}</p>
        ) : null}
      </AdHocScenarioAuthoringBody>
      <Drawer.Footer
        secondaryActions={
          <DrawerErrorDisplay
            count={authoring.errorCount + (saveError ? 1 : 0)}
            firstMessage={authoring.firstError ?? saveError ?? undefined}
          />
        }
        actions={
          <>
            <Button variant="subtle" tone="neutral" size="sm" onClick={onClose}>
              Close
            </Button>
            <Button
              variant="solid"
              tone="neutral"
              size="sm"
              disabled={!authoring.canSave}
              tooltip={authoring.firstError}
              onClick={save}
            >
              Save
            </Button>
          </>
        }
      />
    </Drawer>
  );
};

interface ViewScenarioDrawerProps {
  open: boolean;
  onClose: () => void;
  scenario: Scenario | undefined;
}

export const ViewScenarioDrawer = ({
  open,
  onClose,
  scenario,
}: ViewScenarioDrawerProps) => {
  if (!open || !scenario) {
    return null;
  }
  return (
    <ViewScenarioContent
      key={scenario.id}
      scenario={scenario}
      onClose={onClose}
    />
  );
};
