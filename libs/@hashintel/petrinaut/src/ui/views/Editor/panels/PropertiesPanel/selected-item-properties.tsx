import { use } from "react";

import { usePetrinautMutations } from "../../../../../react";
import { ActiveNetContext } from "../../../../../react/state/active-net-context";
import { SDCPNContext } from "../../../../../react/state/sdcpn-context";
import { usePanelTarget } from "../../../../../react/state/use-selection";
import { ArcProperties } from "./arc-properties/main";
import { ComponentInstanceProperties } from "./component-instance-properties/main";
import { DifferentialEquationProperties } from "./differential-equation-properties/main";
import { MultiSelectionPanel } from "./multi-selection-panel";
import { ParameterProperties } from "./parameter-properties/main";
import { PlaceProperties } from "./place-properties/main";
import { TransitionProperties } from "./transition-properties/main";
import { TypeProperties } from "./type-properties/main";

/**
 * Resolves the editor selection to the existing entity-specific property
 * content. Layout shells (such as the resizable editor panel)
 * intentionally share this component so their entity rendering cannot drift.
 */
export const SelectedItemProperties: React.FC = () => {
  const { activeNet: petriNetDefinition } = use(ActiveNetContext);
  const { extensions, petriNetDefinition: fullSdcpn } = use(SDCPNContext);
  const {
    updatePlace,
    updateTransition,
    updateArcWeight,
    updateArcType,
    updateArcPlace,
    removeArc,
    updateType,
    addTypeElement,
    updateTypeElement,
    removeTypeElement,
    moveTypeElement,
    updateDifferentialEquation,
    updateParameter,
    updateComponentInstance,
    deleteItemsByIds,
  } = usePetrinautMutations();
  const panelTarget = usePanelTarget();

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
            updatePlace={updatePlace}
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
            net={petriNetDefinition}
            places={petriNetDefinition.places}
            types={extensions.colors ? petriNetDefinition.types : []}
            onArcWeightUpdate={updateArcWeight}
            updateTransition={updateTransition}
            updateArcPlace={updateArcPlace}
            removeArc={removeArc}
          />
        ) : null;
      }

      case "arc":
        return (
          <ArcProperties
            arcId={item.id}
            petriNetDefinition={petriNetDefinition}
            fullSdcpn={fullSdcpn}
            updateArcWeight={updateArcWeight}
            updateArcType={updateArcType}
            removeArc={removeArc}
          />
        );

      case "type": {
        if (!extensions.colors) {
          return null;
        }
        const type = petriNetDefinition.types.find(
          (candidate) => candidate.id === item.id,
        );
        return type ? (
          <TypeProperties
            type={type}
            updateType={updateType}
            addTypeElement={addTypeElement}
            updateTypeElement={updateTypeElement}
            removeTypeElement={removeTypeElement}
            moveTypeElement={moveTypeElement}
          />
        ) : null;
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
            updateDifferentialEquation={updateDifferentialEquation}
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
        return parameter ? (
          <ParameterProperties
            parameter={parameter}
            updateParameter={updateParameter}
          />
        ) : null;
      }

      case "componentInstance": {
        const instance = petriNetDefinition.componentInstances.find(
          (candidate) => candidate.id === item.id,
        );
        if (!instance) {
          return null;
        }
        const subnet =
          (fullSdcpn.subnets ?? []).find(
            (candidate) => candidate.id === instance.subnetId,
          ) ?? null;
        return (
          <ComponentInstanceProperties
            instance={instance}
            subnet={subnet}
            updateComponentInstance={updateComponentInstance}
          />
        );
      }
    }
  }

  if (panelTarget.kind === "multi") {
    return (
      <MultiSelectionPanel
        items={panelTarget.items}
        deleteItemsByIds={deleteItemsByIds}
      />
    );
  }

  return null;
};
