import { css } from "@hashintel/ds-helpers/css";
import { useCallback, useEffect, useState } from "react";

import { GlassPanel } from "../../../../components/glass-panel";
import {
  DEFAULT_PROPERTIES_PANEL_WIDTH,
  MAX_PROPERTIES_PANEL_WIDTH,
  MIN_PROPERTIES_PANEL_WIDTH,
  PANEL_MARGIN,
} from "../../../../constants/ui";
import { useEditorStore } from "../../../../state/editor-provider";
import { useSDCPNContext } from "../../../../state/sdcpn-provider";
import { DifferentialEquationProperties } from "./differential-equation-properties";
import { ParameterProperties } from "./parameter-properties";
import { PlaceProperties } from "./place-properties";
import { TransitionProperties } from "./transition-properties";
import { TypeProperties } from "./type-properties";

/**
 * PropertiesPanel displays properties and controls for the selected node/edge.
 */
export const PropertiesPanel: React.FC = () => {
  const selectedResourceId = useEditorStore(
    (state) => state.selectedResourceId
  );
  const globalMode = useEditorStore((state) => state.globalMode);
  const setPropertiesPanelWidth = useEditorStore(
    (state) => state.setPropertiesPanelWidth
  );
  const isBottomPanelOpen = useEditorStore((state) => state.isBottomPanelOpen);
  const bottomPanelHeight = useEditorStore((state) => state.bottomPanelHeight);

  const {
    getItemType,
    petriNetDefinition,
    updatePlace,
    updateTransition,
    updateArcWeight,
    updateType,
    updateDifferentialEquation,
    updateParameter,
  } = useSDCPNContext();

  const [panelWidth, setPanelWidthLocal] = useState(
    DEFAULT_PROPERTIES_PANEL_WIDTH
  );

  // Sync panel width with global store
  const handleResize = useCallback(
    (newWidth: number) => {
      setPanelWidthLocal(newWidth);
      setPropertiesPanelWidth(newWidth);
    },
    [setPropertiesPanelWidth]
  );

  // Initialize store with starting width
  useEffect(() => {
    setPropertiesPanelWidth(DEFAULT_PROPERTIES_PANEL_WIDTH);
  }, [setPropertiesPanelWidth]);

  // Don't show panel if nothing is selected
  if (!selectedResourceId) {
    return null;
  }

  // Use the selected resource ID directly
  const selectedId = selectedResourceId;

  // Use getItemType to determine what kind of item is selected
  const itemType = getItemType(selectedId);

  // Don't show panel for arcs - they can only be deleted, not edited
  if (itemType === "arc") {
    return null;
  }

  let content: React.ReactNode = null;

  switch (itemType) {
    case "place": {
      const placeData = petriNetDefinition.places.find(
        (place) => place.id === selectedId
      );
      if (placeData) {
        content = (
          <PlaceProperties
            place={placeData}
            types={petriNetDefinition.types}
            differentialEquations={petriNetDefinition.differentialEquations}
            globalMode={globalMode}
            updatePlace={updatePlace}
          />
        );
      }
      break;
    }

    case "transition": {
      const transitionData = petriNetDefinition.transitions.find(
        (transition) => transition.id === selectedId
      );
      if (transitionData) {
        content = (
          <TransitionProperties
            transition={transitionData}
            places={petriNetDefinition.places}
            types={petriNetDefinition.types}
            globalMode={globalMode}
            onArcWeightUpdate={updateArcWeight}
            updateTransition={updateTransition}
          />
        );
      }
      break;
    }

    case "type": {
      const typeData = petriNetDefinition.types.find(
        (type) => type.id === selectedId
      );
      if (typeData) {
        content = (
          <TypeProperties
            type={typeData}
            updateType={updateType}
            globalMode={globalMode}
          />
        );
      }
      break;
    }

    case "differentialEquation": {
      const equationData = petriNetDefinition.differentialEquations.find(
        (equation) => equation.id === selectedId
      );
      if (equationData) {
        content = (
          <DifferentialEquationProperties
            differentialEquation={equationData}
            types={petriNetDefinition.types}
            places={petriNetDefinition.places}
            globalMode={globalMode}
            updateDifferentialEquation={updateDifferentialEquation}
          />
        );
      }
      break;
    }

    case "parameter": {
      const parameterData = petriNetDefinition.parameters.find(
        (parameter) => parameter.id === selectedId
      );
      if (parameterData) {
        content = (
          <ParameterProperties
            parameter={parameterData}
            updateParameter={updateParameter}
            globalMode={globalMode}
          />
        );
      }
      break;
    }

    default:
      // Unknown item type
      content = (
        <div
          style={{
            padding: 16,
            textAlign: "center",
            color: "#999",
            fontSize: 14,
          }}
        >
          Unknown item selected
        </div>
      );
  }

  // Calculate bottom offset based on bottom panel visibility
  // Gap between PropertiesPanel and BottomPanel matches gap between LeftSideBar and BottomPanel
  const bottomOffset = isBottomPanelOpen
    ? bottomPanelHeight + PANEL_MARGIN
    : 0;

  return (
    <div
      style={{
        display: "flex",
        position: "fixed",
        top: 0,
        right: 0,
        bottom: bottomOffset,
        padding: PANEL_MARGIN,
        zIndex: 1000,
        pointerEvents: "none",
      }}
    >
      <GlassPanel
        className={css({
          height: "[100%]",
        })}
        style={{
          width: panelWidth,
          pointerEvents: "auto",
        }}
        contentStyle={{
          padding: 16,
          overflowY: "auto",
        }}
        resizable={{
          edge: "left",
          size: panelWidth,
          onResize: handleResize,
          minSize: MIN_PROPERTIES_PANEL_WIDTH,
          maxSize: MAX_PROPERTIES_PANEL_WIDTH,
        }}
      >
        {content}
      </GlassPanel>
    </div>
  );
};
