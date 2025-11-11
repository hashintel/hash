import { RefractivePane } from "@hashintel/ds-components/refractive-pane";
import { css } from "@hashintel/ds-helpers/css";
import { useCallback, useEffect, useRef, useState } from "react";

import { useEditorStore } from "../../../../state/editor-provider";
import { useSDCPNStore } from "../../../../state/sdcpn-provider";
import { DifferentialEquationProperties } from "./differential-equation-properties";
import { MultipleSelection } from "./multiple-selection";
import { ParameterProperties } from "./parameter-properties";
import { PlaceProperties } from "./place-properties";
import { TransitionProperties } from "./transition-properties";
import { TypeProperties } from "./type-properties";

const startingWidth = 450;

/**
 * PropertiesPanel displays properties and controls for the selected node/edge.
 */
export const PropertiesPanel: React.FC = () => {
  const selectedItemIds = useEditorStore((state) => state.selectedItemIds);
  const getItemType = useEditorStore((state) => state.getItemType);
  const globalMode = useEditorStore((state) => state.globalMode);
  const sdcpn = useSDCPNStore((state) => state.sdcpn);
  const updatePlace = useSDCPNStore((state) => state.updatePlace);
  const updateTransition = useSDCPNStore((state) => state.updateTransition);
  const updateArcWeight = useSDCPNStore((state) => state.updateArcWeight);
  const updateType = useSDCPNStore((state) => state.updateType);
  const updateDifferentialEquation = useSDCPNStore(
    (state) => state.updateDifferentialEquation,
  );

  // Resize functionality
  const [panelWidth, setPanelWidth] = useState(startingWidth);
  const [isResizing, setIsResizing] = useState(false);
  const [isResizeHandleHovered, setIsResizeHandleHovered] = useState(false);
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
  if (selectedItemIds.size === 0) {
    return null;
  }

  // Show multiple items message if more than one item selected
  if (selectedItemIds.size > 1) {
    return (
      <div
        style={{
          display: "flex",
          position: "fixed",
          top: 0,
          right: 0,
          bottom: 0,
          padding: "16px",
          height: "100%",
          zIndex: 1000,
        }}
      >
        <RefractivePane
          radius={16}
          blur={7}
          specularOpacity={0.2}
          scaleRatio={1}
          bezelWidth={65}
          glassThickness={120}
          refractiveIndex={1.5}
          className={css({
            height: "[100%]",
            width: `[${panelWidth}px]`,
            backgroundColor: "[rgba(255, 255, 255, 0.7)]",
            boxShadow: "0 4px 30px rgba(0, 0, 0, 0.15)",
            border: "1px solid rgba(255, 255, 255, 0.8)",
          })}
          style={{
            borderRadius: 16,
            padding: 16,
          }}
        >
          <MultipleSelection count={selectedItemIds.size} />
        </RefractivePane>
      </div>
    );
  }

  // Single item selected - show its properties
  const [selectedId] = selectedItemIds;
  if (!selectedId) {
    return null;
  }

  let content: React.ReactNode = null;

  // Use getItemType to determine what kind of item is selected
  const itemType = getItemType(selectedId);

  switch (itemType) {
    case "place": {
      const placeData = sdcpn.places.find((place) => place.id === selectedId);
      if (placeData) {
        content = (
          <PlaceProperties
            place={placeData}
            types={sdcpn.types}
            differentialEquations={sdcpn.differentialEquations}
            globalMode={globalMode}
            onUpdate={updatePlace}
          />
        );
      }
      break;
    }

    case "transition": {
      const transitionData = sdcpn.transitions.find(
        (transition) => transition.id === selectedId,
      );
      if (transitionData) {
        content = (
          <TransitionProperties
            transition={transitionData}
            places={sdcpn.places}
            types={sdcpn.types}
            globalMode={globalMode}
            onUpdate={updateTransition}
            onArcWeightUpdate={updateArcWeight}
          />
        );
      }
      break;
    }

    case "type": {
      const typeData = sdcpn.types.find((type) => type.id === selectedId);
      if (typeData) {
        content = (
          <TypeProperties
            type={typeData}
            onUpdate={updateType}
            globalMode={globalMode}
          />
        );
      }
      break;
    }

    case "differentialEquation": {
      const equationData = sdcpn.differentialEquations.find(
        (equation) => equation.id === selectedId,
      );
      if (equationData) {
        content = (
          <DifferentialEquationProperties
            differentialEquation={equationData}
            types={sdcpn.types}
            places={sdcpn.places}
            globalMode={globalMode}
            onUpdate={updateDifferentialEquation}
          />
        );
      }
      break;
    }

    case "parameter": {
      const parameterData = sdcpn.parameters.find(
        (parameter) => parameter.id === selectedId,
      );
      if (parameterData) {
        content = <ParameterProperties parameter={parameterData} />;
      }
      break;
    }

    case "arc": {
      // Parse arc ID: $A_<inputId>_<outputId>
      const parts = selectedId.split("_");
      if (parts.length === 3) {
        const inputId = parts[1];
        const outputId = parts[2];

        // Determine if this is a place->transition or transition->place arc
        const inputPlace = sdcpn.places.find((place) => place.id === inputId);
        const outputPlace = sdcpn.places.find((place) => place.id === outputId);
        const inputTransition = sdcpn.transitions.find(
          (transition) => transition.id === inputId,
        );
        const outputTransition = sdcpn.transitions.find(
          (transition) => transition.id === outputId,
        );

        let arcType: "input" | "output" | null = null;
        let placeId: string | null | undefined = null;
        let transitionId: string | null | undefined = null;
        let arcWeight = 1;

        if (inputPlace && outputTransition) {
          // Input arc: place -> transition
          arcType = "input";
          placeId = inputId;
          transitionId = outputId;
          const arc = outputTransition.inputArcs.find(
            (arcItem) => arcItem.placeId === inputId,
          );
          if (arc) {
            arcWeight = arc.weight;
          }
        } else if (inputTransition && outputPlace) {
          // Output arc: transition -> place
          arcType = "output";
          placeId = outputId;
          transitionId = inputId;
          const arc = inputTransition.outputArcs.find(
            (arcItem) => arcItem.placeId === outputId,
          );
          if (arc) {
            arcWeight = arc.weight;
          }
        }

        if (arcType && placeId && transitionId) {
          const place = sdcpn.places.find(
            (placeItem) => placeItem.id === placeId,
          );
          const transition = sdcpn.transitions.find(
            (transitionItem) => transitionItem.id === transitionId,
          );

          content = (
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <div>
                <div style={{ fontWeight: 600, fontSize: 16, marginBottom: 8 }}>
                  Arc ({arcType})
                </div>
              </div>

              <div>
                <div style={{ fontWeight: 500, fontSize: 12, marginBottom: 4 }}>
                  Direction
                </div>
                <div style={{ fontSize: 14 }}>
                  {arcType === "input" ? (
                    <>
                      {place?.name ?? placeId} →{" "}
                      {transition?.name ?? transitionId}
                    </>
                  ) : (
                    <>
                      {transition?.name ?? transitionId} →{" "}
                      {place?.name ?? placeId}
                    </>
                  )}
                </div>
              </div>

              <div>
                <div style={{ fontWeight: 500, fontSize: 12, marginBottom: 4 }}>
                  Place
                </div>
                <div style={{ fontSize: 14 }}>{place?.name ?? placeId}</div>
                <div style={{ fontSize: 12, color: "#666" }}>{placeId}</div>
              </div>

              <div>
                <div style={{ fontWeight: 500, fontSize: 12, marginBottom: 4 }}>
                  Transition
                </div>
                <div style={{ fontSize: 14 }}>
                  {transition?.name ?? transitionId}
                </div>
                <div style={{ fontSize: 12, color: "#666" }}>
                  {transitionId}
                </div>
              </div>

              <div>
                <div style={{ fontWeight: 500, fontSize: 12, marginBottom: 4 }}>
                  Weight
                </div>
                <div style={{ fontSize: 14 }}>{arcWeight}</div>
              </div>
            </div>
          );
        }
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
          onMouseEnter={() => {
            setIsResizeHandleHovered(true);
          }}
          onMouseLeave={() => {
            setIsResizeHandleHovered(false);
          }}
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
            width: 4,
            cursor: "ew-resize",
            zIndex: 1001,
            background: "transparent",
            border: "none",
            padding: 0,
            borderRadius: "16px 0 0 16px",
            backgroundColor: isResizeHandleHovered
              ? "rgba(78, 221, 240, 0.3)"
              : "transparent",
            transition: "background-color 0.4s",
            transitionDelay: "0.2s",
          }}
        />

        <RefractivePane
          radius={16}
          blur={7}
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
            padding: 16,
            overflowY: "auto",
          }}
        >
          {content}
        </RefractivePane>
      </div>
    </div>
  );
};
