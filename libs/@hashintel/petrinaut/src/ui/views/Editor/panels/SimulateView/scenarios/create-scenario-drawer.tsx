import { useStore } from "@tanstack/react-form";
import { use } from "react";

import { Button, Drawer } from "@hashintel/ds-components";
import { css } from "@hashintel/ds-helpers/css";
import { scenarioSchema, type Color } from "@hashintel/petrinaut-core";

import { usePetrinautMutations } from "../../../../../../react";
import { LanguageClientContext } from "../../../../../../react/lsp/context";
import { SDCPNContext } from "../../../../../../react/state/sdcpn-context";
import { DrawerErrorDisplay } from "../drawer-error-display";
import {
  ScenarioFormBody,
  type ScenarioFormInstance,
  useScenarioForm,
} from "./scenario-form";
import { EMPTY_SCENARIO_FORM_STATE } from "./scenario-form-defaults";
import { summarizeScenarioLspErrors } from "./scenario-lsp";
import {
  buildScenarioFromFormState,
  type ScenarioTokenRowContext,
} from "./scenario-mapping";

// Padding + scroll container for the standalone form (drawer chrome provides
// this when rendered inside a `Drawer.Body`).
const standaloneBodyStyle = css({
  padding: "5",
  height: "full",
  overflowY: "auto",
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
    <Drawer.Footer
      secondaryActions={
        <DrawerErrorDisplay count={totalErrorCount} firstMessage={firstError} />
      }
      actions={
        <>
          <Button variant="subtle" tone="neutral" size="sm" onClick={onClose}>
            Cancel
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
                  ? "Make changes to enable creation."
                  : undefined)
            }
            onClick={() => {
              void form.handleSubmit();
            }}
          >
            Create
          </Button>
        </>
      }
    />
  );
};

// -- Standalone form body (used by drawer + stories) --------------------------

const CreateScenarioBody = ({ form }: { form: ScenarioFormInstance }) => {
  const { extensions, petriNetDefinition } = use(SDCPNContext);

  const typesById = new Map<string, Color>();
  if (extensions.colors) {
    for (const type of petriNetDefinition.types) {
      typesById.set(type.id, type);
    }
  }

  return (
    <ScenarioFormBody
      form={form}
      parameters={extensions.parameters ? petriNetDefinition.parameters : []}
      places={petriNetDefinition.places}
      typesById={typesById}
      idPrefix="create-"
    />
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
  const { addScenario } = usePetrinautMutations();

  const existingScenarioNames = new Set(
    (petriNetDefinition.scenarios ?? []).map((s) => s.name),
  );

  const tokenRowContext: ScenarioTokenRowContext = {
    places: petriNetDefinition.places,
    typesById: new Map(petriNetDefinition.types.map((type) => [type.id, type])),
  };

  const form = useScenarioForm(
    EMPTY_SCENARIO_FORM_STATE,
    (value, ctx) => {
      const scenario = buildScenarioFromFormState(
        value,
        crypto.randomUUID(),
        tokenRowContext,
      );
      // Final structural validation against the persistence schema.
      const result = scenarioSchema.safeParse(scenario);
      if (!result.success) {
        return;
      }
      addScenario(result.data);
      onClose();
      // Reset to defaults so reopening the drawer starts empty.
      // Use ctx.reset (formApi from TanStack) instead of the outer `form`
      // reference — avoids a "use before declaration" closure capture.
      ctx.reset();
    },
    { existingScenarioNames },
  );

  if (!open) {
    return null;
  }

  return (
    <Drawer showBackdrop={false} onClose={onClose} swapKey="scenario">
      <Drawer.Header
        title="Create a scenario"
        description="Initial configurations of tokens that can be quickly loaded in to 'Model' or 'Simulate' mode"
      />
      <Drawer.Body className={css({ paddingTop: "[0]" })}>
        <CreateScenarioBody form={form} />
      </Drawer.Body>
      <CreateScenarioFooter form={form} onClose={onClose} />
    </Drawer>
  );
};

// -- Standalone form (for stories / other consumers) --------------------------

export const CreateScenarioForm = () => {
  const { petriNetDefinition } = use(SDCPNContext);
  const existingScenarioNames = new Set(
    (petriNetDefinition.scenarios ?? []).map((s) => s.name),
  );

  const form = useScenarioForm(EMPTY_SCENARIO_FORM_STATE, () => {}, {
    existingScenarioNames,
  });

  return (
    <div className={standaloneBodyStyle}>
      <CreateScenarioBody form={form} />
    </div>
  );
};
