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
import { MutationContext } from "../../../../state/mutation-context";
import { SDCPNContext } from "../../../../state/sdcpn-context";
import { usePanelTarget } from "../../../../state/use-selection";
import { UserSettingsContext } from "../../../../state/user-settings-context";
import { ArcProperties } from "./arc-properties/main";
import { DifferentialEquationProperties } from "./differential-equation-properties/main";
import { MultiSelectionPanel } from "./multi-selection-panel";
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
      true: {},
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
    setPropertiesPanelWidth,
    isBottomPanelOpen,
    bottomPanelHeight,
    isPanelAnimating,
  } = use(EditorContext);

  const { petriNetDefinition } = use(SDCPNContext);
  const {
    updatePlace,
    updateTransition,
    updateArcWeight,
    updateArcType,
    removeArc,
    updateType,
    updateDifferentialEquation,
    updateParameter,
    deleteItemsByIds,
  } = use(MutationContext);

  const panelTarget = usePanelTarget();

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

  const isOpen = panelTarget.kind !== "none";

  let content: React.ReactNode = null;

  if (panelTarget.kind === "single") {
    const { item } = panelTarget;

    switch (item.type) {
      case "place": {
        const placeData = petriNetDefinition.places.find(
          (place) => place.id === item.id,
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
          (transition) => transition.id === item.id,
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

      case "arc": {
        content = (
          <ArcProperties
            arcId={item.id}
            petriNetDefinition={petriNetDefinition}
            updateArcWeight={updateArcWeight}
            updateArcType={updateArcType}
            removeArc={removeArc}
          />
        );
        break;
      }

      case "type": {
        const typeData = petriNetDefinition.types.find(
          (type) => type.id === item.id,
        );
        if (typeData) {
          content = <TypeProperties type={typeData} updateType={updateType} />;
        }
        break;
      }

      case "differentialEquation": {
        const equationData = petriNetDefinition.differentialEquations.find(
          (equation) => equation.id === item.id,
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
          (parameter) => parameter.id === item.id,
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
  } else if (panelTarget.kind === "multi") {
    content = (
      <MultiSelectionPanel
        items={panelTarget.items}
        deleteItemsByIds={deleteItemsByIds}
      />
    );
  }

  // Calculate bottom offset based on bottom panel visibility
  // Gap between PropertiesPanel and BottomPanel matches gap between LeftSideBar and BottomPanel
  const bottomOffset = isBottomPanelOpen ? bottomPanelHeight + PANEL_MARGIN : 0;

  const { keepPanelsMounted } = use(UserSettingsContext);

  if (!isOpen && !isPanelAnimating && !keepPanelsMounted) {
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
