import { use, useState } from "react";

import { Button, Drawer } from "@hashintel/ds-components";
import { scenarioSchema } from "@hashintel/petrinaut-core";

import { usePetrinautMutations } from "../../../../../../react";
import { SDCPNContext } from "../../../../../../react/state/sdcpn-context";
import { DrawerErrorDisplay } from "../drawer-error-display";
import {
  AdHocScenarioAuthoringBody,
  useAdHocScenarioAuthoring,
} from "./ad-hoc-scenario-authoring";

/**
 * The creation drawer's content: the expose-mode scenario form under Name
 * and Description. A child of the drawer so its hook and LSP session mount
 * only while the drawer is open.
 */
const CreateScenarioContent = ({ onClose }: { onClose: () => void }) => {
  const { petriNetDefinition } = use(SDCPNContext);
  const { addScenario } = usePetrinautMutations();
  const existingScenarioNames = new Set(
    (petriNetDefinition.scenarios ?? []).map((scenario) => scenario.name),
  );
  // A schema rejection after a passing form would otherwise be a silent
  // no-op click; surface it in the footer instead.
  const [saveError, setSaveError] = useState<string | null>(null);
  const authoring = useAdHocScenarioAuthoring({ existingScenarioNames });

  const save = () => {
    const scenario = authoring.buildScenario(crypto.randomUUID());
    if (!scenario) {
      return;
    }
    // Final structural validation against the persistence schema.
    const result = scenarioSchema.safeParse(scenario);
    if (!result.success) {
      setSaveError(
        result.error.issues[0]?.message ?? "The scenario failed validation.",
      );
      return;
    }
    addScenario(result.data);
    onClose();
  };

  return (
    <Drawer showBackdrop={false} onClose={onClose} swapKey="scenario">
      <Drawer.Header
        title="Create a scenario"
        description="Initial configurations of tokens that can be quickly loaded in to 'Model' or 'Simulate' mode"
      />
      <AdHocScenarioAuthoringBody authoring={authoring} />
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
              Cancel
            </Button>
            <Button
              variant="solid"
              tone="neutral"
              size="sm"
              disabled={!authoring.canSave}
              tooltip={authoring.firstError}
              onClick={save}
            >
              Create
            </Button>
          </>
        }
      />
    </Drawer>
  );
};

interface CreateScenarioDrawerProps {
  open: boolean;
  onClose: () => void;
}

export const CreateScenarioDrawer = ({
  open,
  onClose,
}: CreateScenarioDrawerProps) => {
  if (!open) {
    return null;
  }
  return <CreateScenarioContent onClose={onClose} />;
};
