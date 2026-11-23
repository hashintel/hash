import { use } from "react";

import { css } from "@hashintel/ds-helpers/css";
import { resolveComponent } from "@hashintel/petrinaut-core";

import { ActiveNetContext } from "../../../../../react/document/active-net-context";
import { CompositionContext } from "../../../../../react/document/composition-context";
import { SDCPNContext } from "../../../../../react/document/sdcpn-context";
import { ArcProperties } from "./arc-properties/main";
import { ComponentInstanceProperties } from "./component-instance-properties/main";
import { DifferentialEquationProperties } from "./differential-equation-properties/main";
import { FusionProperties } from "./fusion-properties/main";
import { MultiSelectionPanel } from "./multi-selection-properties/main";
import { ParameterProperties } from "./parameter-properties/main";
import { PlaceProperties } from "./place-properties/main";
import { TransitionProperties } from "./transition-properties/main";
import { TypeProperties } from "./type-properties/main";

import type { PanelTarget } from "@hashintel/petrinaut-core";

const propertiesStyle = css({
  display: "flex",
  flexDirection: "column",
  height: "full",
  minHeight: "0",
  "--petrinaut-panel-divider-color": "var(--colors-neutral-a40)",
  "--petrinaut-panel-toggle-opacity": "1",
});

/**
 * The properties of what is selected. The editor's panel and the preview's
 * panel both render this, so the two cannot drift.
 */
const SelectedItemPropertiesContent: React.FC<{
  panelTarget: PanelTarget;
}> = ({ panelTarget }) => {
  const { activeNet: petriNetDefinition } = use(ActiveNetContext);
  const { extensions, petriNetDefinition: fullSdcpn } = use(SDCPNContext);
  const { libraries } = use(CompositionContext);

  if (panelTarget.kind === "single") {
    const { item } = panelTarget;

    switch (item.type) {
      case "place": {
        const place = petriNetDefinition.places.find(
          (candidate) => candidate.id === item.id,
        );
        return place ? (
          <PlaceProperties
            place={place}
            types={extensions.colors ? petriNetDefinition.types : []}
          />
        ) : null;
      }

      case "transition": {
        const transition = petriNetDefinition.transitions.find(
          (candidate) => candidate.id === item.id,
        );
        return transition ? (
          <TransitionProperties
            transition={transition}
            types={extensions.colors ? petriNetDefinition.types : []}
          />
        ) : null;
      }

      case "arc":
        return (
          <ArcProperties
            arcId={item.id}
            petriNetDefinition={petriNetDefinition}
            fullSdcpn={fullSdcpn}
          />
        );

      case "type": {
        if (!extensions.colors) {
          return null;
        }
        const type = petriNetDefinition.types.find(
          (candidate) => candidate.id === item.id,
        );
        return type ? <TypeProperties type={type} /> : null;
      }

      case "differentialEquation": {
        if (!extensions.colors || !extensions.dynamics) {
          return null;
        }
        const differentialEquation =
          petriNetDefinition.differentialEquations.find(
            (candidate) => candidate.id === item.id,
          );
        return differentialEquation ? (
          <DifferentialEquationProperties
            differentialEquation={differentialEquation}
            types={petriNetDefinition.types}
            places={petriNetDefinition.places}
          />
        ) : null;
      }

      case "parameter": {
        if (!extensions.parameters) {
          return null;
        }
        const parameter = petriNetDefinition.parameters.find(
          (candidate) => candidate.id === item.id,
        );
        return parameter ? <ParameterProperties parameter={parameter} /> : null;
      }

      case "componentInstance": {
        const instance = petriNetDefinition.componentInstances.find(
          (candidate) => candidate.id === item.id,
        );
        if (!instance) {
          return null;
        }
        const component =
          resolveComponent(fullSdcpn, instance.component, libraries) ?? null;
        return (
          <ComponentInstanceProperties
            instance={instance}
            component={component}
          />
        );
      }

      case "fusion": {
        const fusion = petriNetDefinition.fusions.find(
          (candidate) => candidate.id === item.id,
        );
        return fusion ? <FusionProperties fusion={fusion} /> : null;
      }
    }
  }

  if (panelTarget.kind === "multi") {
    return <MultiSelectionPanel items={panelTarget.items} />;
  }

  return null;
};

export const SelectedItemProperties: React.FC<{
  /** What to show the properties of. */
  panelTarget: PanelTarget;
  /** Shown and not usable: what a panel shows while it slides out. */
  inert?: boolean;
}> = ({ panelTarget, inert = false }) => (
  <div className={propertiesStyle} inert={inert}>
    <SelectedItemPropertiesContent panelTarget={panelTarget} />
  </div>
);
