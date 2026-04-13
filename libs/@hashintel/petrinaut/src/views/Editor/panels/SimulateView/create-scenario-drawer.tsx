import { css } from "@hashintel/ds-helpers/css";
import { useStore } from "@tanstack/react-form";
import { use } from "react";

import { Button } from "../../../../components/button";
import { Drawer } from "../../../../components/drawer";
import type { Color } from "../../../../core/types/sdcpn";
import { LanguageClientContext } from "../../../../lsp/context";
import { SDCPNContext } from "../../../../state/sdcpn-context";
import { EMPTY_SCENARIO_FORM_STATE } from "./scenario-form-defaults";
import {
  ScenarioFormBody,
  type ScenarioFormInstance,
  useScenarioForm,
} from "./scenario-form";
import { hasScenarioLspErrors } from "./scenario-lsp";

const bodyStyle = css({
  overflowY: "auto",
  // Override Drawer.Body default `padding: 5`. Vertical padding on the scroll
  // container would create a gap above sticky section headers (they would pin
  // below it). Section headers/contents own their own vertical spacing.
  paddingX: "5",
  paddingY: "[0]",
  flex: "1",
});

// -- Footer (subscribes to form + LSP state for submit gating) ----------------

const CreateScenarioFooter = ({
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
  // Derive `hasLspErrors` during render — no useEffect needed.
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
        Cancel
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
        Next
      </Button>
    </Drawer.Footer>
  );
};

// -- Standalone form body (used by drawer + stories) --------------------------

const CreateScenarioBody = ({ form }: { form: ScenarioFormInstance }) => {
  const { petriNetDefinition } = use(SDCPNContext);

  const typesById = new Map<string, Color>();
  for (const type of petriNetDefinition.types) {
    typesById.set(type.id, type);
  }

  return (
    <Drawer.Body className={bodyStyle}>
      <ScenarioFormBody
        form={form}
        parameters={petriNetDefinition.parameters}
        places={petriNetDefinition.places}
        typesById={typesById}
        idPrefix="create-"
      />
    </Drawer.Body>
  );
};

// -- Drawer wrapper -----------------------------------------------------------

interface CreateScenarioDrawerProps {
  open: boolean;
  onClose: () => void;
}

export const CreateScenarioDrawer = ({
  open,
  onClose,
}: CreateScenarioDrawerProps) => {
  const { petriNetDefinition } = use(SDCPNContext);
  const existingScenarioNames = new Set(
    (petriNetDefinition.scenarios ?? []).map((s) => s.name),
  );

  const form = useScenarioForm(
    EMPTY_SCENARIO_FORM_STATE,
    (value) => {
      // TODO: persist the scenario — placeholder for next step
      // eslint-disable-next-line no-console
      console.log("submit scenario", value);
    },
    { existingScenarioNames },
  );

  return (
    <Drawer.Root open={open} onClose={onClose}>
      <Drawer.Card onClose={onClose}>
        <Drawer.Header description="Initial configurations of tokens that can be quickly loaded in to 'Model' or 'Simulate' mode">
          Create a scenario
        </Drawer.Header>
        <CreateScenarioBody form={form} />
      </Drawer.Card>
      <CreateScenarioFooter form={form} onClose={onClose} />
    </Drawer.Root>
  );
};

// -- Standalone form (for stories / other consumers) --------------------------

export const CreateScenarioForm = () => {
  const { petriNetDefinition } = use(SDCPNContext);
  const existingScenarioNames = new Set(
    (petriNetDefinition.scenarios ?? []).map((s) => s.name),
  );

  const form = useScenarioForm(
    EMPTY_SCENARIO_FORM_STATE,
    (value) => {
      // eslint-disable-next-line no-console
      console.log("submit scenario", value);
    },
    { existingScenarioNames },
  );

  return <CreateScenarioBody form={form} />;
};
