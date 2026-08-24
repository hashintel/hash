/**
 * Drawer hosting the ad-hoc scenario form for quick simulation: with no
 * scenario selected, the user defines Initial State + Parameters here and the
 * simulation provider compiles them through a scenario generated at run time
 * and never persisted into the net file. Optimize selection is off — this is
 * the plain-runs consumer of the form.
 */

import { use } from "react";

import { Button, Drawer } from "@hashintel/ds-components";
import { css } from "@hashintel/ds-helpers/css";

import { SimulationContext } from "../../../../../../react/simulation/context";
import { SDCPNContext } from "../../../../../../react/state/sdcpn-context";
import { AdHocScenarioForm } from "../../../../../components/ad-hoc-scenario-form/ad-hoc-scenario-form";
import { EMPTY_AD_HOC_STATE } from "../../../../../components/ad-hoc-scenario-form/state";

const footerStyle = css({
  display: "flex",
  justifyContent: "space-between",
  gap: "2",
});

export interface AdHocScenarioDrawerProps {
  open: boolean;
  onClose: () => void;
}

export const AdHocScenarioDrawer = ({
  open,
  onClose,
}: AdHocScenarioDrawerProps) => {
  const { petriNetDefinition, extensions } = use(SDCPNContext);
  const { adHocScenario, setAdHocScenario } = use(SimulationContext);

  if (!open) {
    return null;
  }

  return (
    <Drawer
      size="lg"
      showBackdrop={false}
      onClose={onClose}
      swapKey="adhoc-scenario"
    >
      <Drawer.Header
        title="Define initial state"
        description="Token counts and values for this run, without saving a scenario. Every value is an expression and may read scenario.<variable> and parameters.<name>."
      />
      <Drawer.Body>
        <AdHocScenarioForm
          state={adHocScenario ?? EMPTY_AD_HOC_STATE}
          onChange={setAdHocScenario}
          context={{
            // The settings panel's own parameter inputs stay the single
            // owner of parameter values, so the form's parameters section is
            // omitted by handing it none.
            netParameters: [],
            places: petriNetDefinition.places,
            types: extensions.colors ? petriNetDefinition.types : [],
          }}
          selection="none"
        />
      </Drawer.Body>
      <Drawer.Footer>
        <div className={footerStyle}>
          <Button
            size="sm"
            variant="subtle"
            tone="neutral"
            onClick={() => setAdHocScenario(null)}
          >
            Clear
          </Button>
          <Button size="sm" onClick={onClose}>
            Done
          </Button>
        </div>
      </Drawer.Footer>
    </Drawer>
  );
};
