import { RefractivePane } from "@hashintel/ds-components/refractive-pane";
import { css } from "@hashintel/ds-helpers/css";
import { useCallback, useEffect, useRef, useState } from "react";

import { useEditorStore } from "../../../../state/editor-provider";
import { useSDCPNContext } from "../../../../state/sdcpn-provider";
import { DifferentialEquationProperties } from "./differential-equation-properties";
import { ParameterProperties } from "./parameter-properties";
import { PlaceProperties } from "./place-properties";
import { TransitionProperties } from "./transition-properties";
import { TypeProperties } from "./type-properties";

const startingWidth = 450;

/**
 * PropertiesPanel displays properties and controls for the selected node/edge.
 */
export const PropertiesPanel: React.FC = () => {
  const selectedResourceId = useEditorStore(
    (state) => state.selectedResourceId,
  );
  const globalMode = useEditorStore((state) => state.globalMode);

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

  // Resize functionality
  const [panelWidth, setPanelWidth] = useState(startingWidth);
  const [isResizing, setIsResizing] = useState(false);
  const resizeStartXRef = useRef(0);
  const resizeStartWidthRef = useRef(startingWidth);

  const handleResizeStart = useCallback(
    (event: React.MouseEvent) => {
      event.preventDefault();
      setIsResizing(true);
      resizeStartXRef.current = event.clientX;
      resizeStartWidthRef.current = panelWidth;
    },
    [panelWidth],
  );

  const handleResizeMove = useCallback(
    (event: MouseEvent) => {
      if (!isResizing) {
        return;
      }

      const deltaX = resizeStartXRef.current - event.clientX;
      const newWidth = Math.max(
        250,
        Math.min(800, resizeStartWidthRef.current + deltaX),
      );
      setPanelWidth(newWidth);
    },
    [isResizing],
  );

  const handleResizeEnd = useCallback(() => {
    setIsResizing(false);
  }, []);

  useEffect(() => {
    if (isResizing) {
      document.addEventListener("mousemove", handleResizeMove);
      document.addEventListener("mouseup", handleResizeEnd);
      document.body.style.cursor = "ew-resize";
      document.body.style.userSelect = "none";

      return () => {
        document.removeEventListener("mousemove", handleResizeMove);
        document.removeEventListener("mouseup", handleResizeEnd);
        document.body.style.cursor = "";
        document.body.style.userSelect = "";
      };
    }
  }, [isResizing, handleResizeMove, handleResizeEnd]);

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
        (place) => place.id === selectedId,
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
        (transition) => transition.id === selectedId,
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
        (type) => type.id === selectedId,
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
        (equation) => equation.id === selectedId,
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
        (parameter) => parameter.id === selectedId,
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

  return (
    <div
      style={{
        display: "flex",
        position: "fixed",
        top: 0,
        right: 0,
        bottom: 0,
        padding: "12px",
        height: "100%",
        zIndex: 1000,
        pointerEvents: "none",
      }}
    >
      <div
        style={{
          position: "relative",
          display: "flex",
          width: panelWidth,
          pointerEvents: "auto",
        }}
      >
        {/* Resize Handle */}
        <button
          type="button"
          aria-label="Resize properties panel"
          onMouseDown={handleResizeStart}
          onKeyDown={(event) => {
            if (event.key === "ArrowLeft") {
              setPanelWidth((prev) => Math.max(250, prev - 10));
            } else if (event.key === "ArrowRight") {
              setPanelWidth((prev) => Math.min(800, prev + 10));
            }
          }}
          style={{
            position: "absolute",
            left: 0,
            top: 0,
            bottom: 0,
            width: 9,
            cursor: "ew-resize",
            zIndex: 1001,
            background: "transparent",
            border: "none",
            padding: 0,
            borderRadius: "16px 0 0 16px",
            backgroundColor: "transparent",
            transition: "background-color 0.4s",
            transitionDelay: "0.2s",
          }}
        />

        <RefractivePane
          radius={16}
          blur={12}
          specularOpacity={0.2}
          scaleRatio={1}
          bezelWidth={65}
          glassThickness={120}
          refractiveIndex={1.5}
          className={css({
            height: "[100%]",
            width: "[100%]",
            backgroundColor: "[rgba(255, 255, 255, 0.7)]",
            boxShadow: "0 4px 30px rgba(0, 0, 0, 0.15)",
            border: "1px solid rgba(255, 255, 255, 0.8)",
          })}
          style={{
            borderRadius: 16,
            overflow: "hidden",
          }}
        >
          <div
            style={{
              position: "relative",
              height: "100%",
              padding: 16,
              overflowY: "auto",
            }}
          >
            {content}
          </div>
        </RefractivePane>
      </div>
    </div>
  );
};
