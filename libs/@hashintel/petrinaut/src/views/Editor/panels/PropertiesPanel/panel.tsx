import { css, cva, cx } from "@hashintel/ds-helpers/css";
import { use, useCallback, useEffect, useState } from "react";

import { GlassPanel } from "../../../../components/glass-panel";
import {
  DEFAULT_PROPERTIES_PANEL_WIDTH,
  MAX_PROPERTIES_PANEL_WIDTH,
  MIN_PROPERTIES_PANEL_WIDTH,
  PANEL_MARGIN,
} from "../../../../constants/ui";
import { EditorContext } from "../../../../state/editor-context";
import { SDCPNContext } from "../../../../state/sdcpn-context";
import { DifferentialEquationProperties } from "./differential-equation-properties/main";
import { ParameterProperties } from "./parameter-properties/main";
import { PlaceProperties } from "./place-properties/main";
import { TransitionProperties } from "./transition-properties/main";
import { TypeProperties } from "./type-properties/main";

const glassPanelStyle = css({
  position: "absolute",
  boxSizing: "border-box",
  top: "[0]",
  right: "[0]",
  zIndex: 1000,
  pointerEvents: "auto",
  borderLeftWidth: "thin",
});

const panelStyle = cva({
  base: {},
  variants: {
    open: {
      true: {
        transform: "translateX(0)",
      },
      false: {
        transform: "translateX(100%)",
        pointerEvents: "none",
      },
    },
    animating: {
      true: {
        transition:
          "[width 150ms ease-in-out, opacity 150ms ease-in-out, height 150ms ease-in-out, top 150ms ease-in-out, left 150ms ease-in-out, right 150ms ease-in-out, bottom 150ms ease-in-out, transform 150ms ease-in-out]",
      },
    },
  },
});

const glassPanelContentStyle = css({
  overflowY: "auto",
});

/**
 * PropertiesPanel displays properties and controls for the selected node/edge.
 */
export const PropertiesPanel: React.FC = () => {
  const {
    selectedResourceId,
    setPropertiesPanelWidth,
    isBottomPanelOpen,
    bottomPanelHeight,
    isPanelAnimating,
  } = use(EditorContext);

  const {
    getItemType,
    petriNetDefinition,
    updatePlace,
    updateTransition,
    updateArcWeight,
    updateType,
    updateDifferentialEquation,
    updateParameter,
  } = use(SDCPNContext);

  const [panelWidth, setPanelWidthLocal] = useState(
    DEFAULT_PROPERTIES_PANEL_WIDTH,
  );

  // Sync panel width with global store
  const handleResize = useCallback(
    (newWidth: number) => {
      setPanelWidthLocal(newWidth);
      setPropertiesPanelWidth(newWidth);
    },
    [setPropertiesPanelWidth],
  );

  // Initialize store with starting width
  useEffect(() => {
    setPropertiesPanelWidth(DEFAULT_PROPERTIES_PANEL_WIDTH);
  }, [setPropertiesPanelWidth]);

  // Determine if the panel should be open and compute content
  const itemType = selectedResourceId ? getItemType(selectedResourceId) : null;
  const isOpen =
    selectedResourceId !== null && itemType !== null && itemType !== "arc";

  let content: React.ReactNode = null;

  if (isOpen) {
    const selectedId = selectedResourceId;

    switch (itemType) {
      case "place": {
        const placeData = petriNetDefinition.places.find(
          (place) => place.id === selectedId,
        );
        if (placeData) {
          content = (
            <PlaceProperties
              place={placeData}
              types={petriNetDefinition.types}
              updatePlace={updatePlace}
            />
          );
        }
        break;
      }

      case "transition": {
        const transitionData = petriNetDefinition.transitions.find(
          (transition) => transition.id === selectedId,
        );
        if (transitionData) {
          content = (
            <TransitionProperties
              transition={transitionData}
              places={petriNetDefinition.places}
              types={petriNetDefinition.types}
              onArcWeightUpdate={updateArcWeight}
              updateTransition={updateTransition}
            />
          );
        }
        break;
      }

      case "type": {
        const typeData = petriNetDefinition.types.find(
          (type) => type.id === selectedId,
        );
        if (typeData) {
          content = <TypeProperties type={typeData} updateType={updateType} />;
        }
        break;
      }

      case "differentialEquation": {
        const equationData = petriNetDefinition.differentialEquations.find(
          (equation) => equation.id === selectedId,
        );
        if (equationData) {
          content = (
            <DifferentialEquationProperties
              differentialEquation={equationData}
              types={petriNetDefinition.types}
              places={petriNetDefinition.places}
              updateDifferentialEquation={updateDifferentialEquation}
            />
          );
        }
        break;
      }

      case "parameter": {
        const parameterData = petriNetDefinition.parameters.find(
          (parameter) => parameter.id === selectedId,
        );
        if (parameterData) {
          content = (
            <ParameterProperties
              parameter={parameterData}
              updateParameter={updateParameter}
            />
          );
        }
        break;
      }
    }
  }

  // Calculate bottom offset based on bottom panel visibility
  // Gap between PropertiesPanel and BottomPanel matches gap between LeftSideBar and BottomPanel
  const bottomOffset = isBottomPanelOpen ? bottomPanelHeight + PANEL_MARGIN : 0;

  if (!isOpen && !isPanelAnimating) {
    return null;
  }

  return (
    <GlassPanel
      className={cx(
        glassPanelStyle,
        panelStyle({ open: isOpen, animating: isPanelAnimating }),
      )}
      style={{
        bottom: bottomOffset,
        padding: PANEL_MARGIN,
        width: panelWidth,
      }}
      contentClassName={glassPanelContentStyle}
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
  );
};
