import { RefractivePane } from "@hashintel/ds-components/refractive-pane";
import { css } from "@hashintel/ds-helpers/css";

import { useEditorStore } from "../../../state/editor-provider";
import { useSDCPNStore } from "../../../state/sdcpn-provider";

/**
 * PropertiesPanel displays properties and controls for the selected node/edge.
 */
export const PropertiesPanel: React.FC = () => {
  const selectedItems = useEditorStore((state) => state.selectedItems);
  const sdcpn = useSDCPNStore((state) => state.sdcpn);

  // Don't show panel if nothing is selected
  if (selectedItems.length === 0) {
    return null;
  }

  // Show multiple items message if more than one item selected
  if (selectedItems.length > 1) {
    return (
      <div
        style={{
          display: "flex",
          position: "fixed",
          top: 0,
          right: 0,
          bottom: 0,
          padding: "24px",
          height: "calc(100% - 48px)",
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
            width: "[320px]",
            backgroundColor: "[rgba(255, 255, 255, 0.7)]",
            boxShadow: "0 4px 30px rgba(0, 0, 0, 0.15)",
            border: "1px solid rgba(255, 255, 255, 0.8)",
          })}
          style={{
            borderRadius: 16,
            padding: 16,
          }}
        >
          <div style={{ fontWeight: 600, fontSize: 14 }}>
            Multiple Items Selected ({selectedItems.length})
          </div>
        </RefractivePane>
      </div>
    );
  }

  // Single item selected - show its properties
  const selectedItem = selectedItems[0];
  if (!selectedItem) {
    return null;
  }

  let content: React.ReactNode = null;

  if (selectedItem.type === "place") {
    const placeData = sdcpn.places.find(
      (place) => place.id === selectedItem.id,
    );
    if (placeData) {
      content = (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <div>
            <div style={{ fontWeight: 600, fontSize: 16, marginBottom: 8 }}>
              Place
            </div>
            <div style={{ fontSize: 12, color: "#666", marginBottom: 16 }}>
              {placeData.id}
            </div>
          </div>

          <div>
            <div style={{ fontWeight: 500, fontSize: 12, marginBottom: 4 }}>
              Name
            </div>
            <div style={{ fontSize: 14 }}>{placeData.name}</div>
          </div>

          <div>
            <div style={{ fontWeight: 500, fontSize: 12, marginBottom: 4 }}>
              Dimensions
            </div>
            <div style={{ fontSize: 14 }}>{placeData.dimensions}</div>
          </div>

          <div>
            <div style={{ fontWeight: 500, fontSize: 12, marginBottom: 4 }}>
              Position
            </div>
            <div style={{ fontSize: 14 }}>
              x: {placeData.x.toFixed(0)}, y: {placeData.y.toFixed(0)}
            </div>
          </div>

          <div>
            <div style={{ fontWeight: 500, fontSize: 12, marginBottom: 4 }}>
              Differential Equation Code
            </div>
            <div
              style={{
                fontSize: 12,
                fontFamily: "monospace",
                backgroundColor: "rgba(0, 0, 0, 0.05)",
                padding: 8,
                borderRadius: 4,
                whiteSpace: "pre-wrap",
                wordBreak: "break-word",
              }}
            >
              {placeData.differentialEquationCode || "(empty)"}
            </div>
          </div>
        </div>
      );
    }
  } else if (selectedItem.type === "transition") {
    const transitionData = sdcpn.transitions.find(
      (transition) => transition.id === selectedItem.id,
    );
    if (transitionData) {
      content = (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <div>
            <div style={{ fontWeight: 600, fontSize: 16, marginBottom: 8 }}>
              Transition
            </div>
            <div style={{ fontSize: 12, color: "#666", marginBottom: 16 }}>
              {transitionData.id}
            </div>
          </div>

          <div>
            <div style={{ fontWeight: 500, fontSize: 12, marginBottom: 4 }}>
              Name
            </div>
            <div style={{ fontSize: 14 }}>{transitionData.name}</div>
          </div>

          <div>
            <div style={{ fontWeight: 500, fontSize: 12, marginBottom: 4 }}>
              Position
            </div>
            <div style={{ fontSize: 14 }}>
              x: {transitionData.x.toFixed(0)}, y: {transitionData.y.toFixed(0)}
            </div>
          </div>

          <div>
            <div style={{ fontWeight: 500, fontSize: 12, marginBottom: 4 }}>
              Input Arcs ({transitionData.inputArcs.length})
            </div>
            <div style={{ fontSize: 12 }}>
              {transitionData.inputArcs.length === 0 ? (
                <div style={{ color: "#999" }}>(none)</div>
              ) : (
                transitionData.inputArcs.map((arc) => (
                  <div key={`input-${arc.placeId}`} style={{ marginBottom: 4 }}>
                    From: {arc.placeId} (weight: {arc.weight})
                  </div>
                ))
              )}
            </div>
          </div>

          <div>
            <div style={{ fontWeight: 500, fontSize: 12, marginBottom: 4 }}>
              Output Arcs ({transitionData.outputArcs.length})
            </div>
            <div style={{ fontSize: 12 }}>
              {transitionData.outputArcs.length === 0 ? (
                <div style={{ color: "#999" }}>(none)</div>
              ) : (
                transitionData.outputArcs.map((arc) => (
                  <div
                    key={`output-${arc.placeId}`}
                    style={{ marginBottom: 4 }}
                  >
                    To: {arc.placeId} (weight: {arc.weight})
                  </div>
                ))
              )}
            </div>
          </div>

          <div>
            <div style={{ fontWeight: 500, fontSize: 12, marginBottom: 4 }}>
              Lambda Code
            </div>
            <div
              style={{
                fontSize: 12,
                fontFamily: "monospace",
                backgroundColor: "rgba(0, 0, 0, 0.05)",
                padding: 8,
                borderRadius: 4,
                whiteSpace: "pre-wrap",
                wordBreak: "break-word",
              }}
            >
              {transitionData.lambdaCode || "(empty)"}
            </div>
          </div>

          <div>
            <div style={{ fontWeight: 500, fontSize: 12, marginBottom: 4 }}>
              Transition Kernel Code
            </div>
            <div
              style={{
                fontSize: 12,
                fontFamily: "monospace",
                backgroundColor: "rgba(0, 0, 0, 0.05)",
                padding: 8,
                borderRadius: 4,
                whiteSpace: "pre-wrap",
                wordBreak: "break-word",
              }}
            >
              {transitionData.transitionKernelCode || "(empty)"}
            </div>
          </div>
        </div>
      );
    }
  } else {
    // selectedItem.type === "arc"
    const { placeId, transitionId, arcType } = selectedItem;
    const place = sdcpn.places.find((placeItem) => placeItem.id === placeId);
    const transition = sdcpn.transitions.find(
      (transitionItem) => transitionItem.id === transitionId,
    );

    let arcWeight = 1;
    if (transition) {
      if (arcType === "input") {
        const arc = transition.inputArcs.find((a) => a.placeId === placeId);
        if (arc) {
          arcWeight = arc.weight;
        }
      } else {
        const arc = transition.outputArcs.find((a) => a.placeId === placeId);
        if (arc) {
          arcWeight = arc.weight;
        }
      }
    }

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
                {place?.name ?? placeId} → {transition?.name ?? transitionId}
              </>
            ) : (
              <>
                {transition?.name ?? transitionId} → {place?.name ?? placeId}
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
          <div style={{ fontSize: 14 }}>{transition?.name ?? transitionId}</div>
          <div style={{ fontSize: 12, color: "#666" }}>{transitionId}</div>
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

  return (
    <div
      style={{
        display: "flex",
        position: "fixed",
        top: 0,
        right: 0,
        bottom: 0,
        padding: "24px",
        height: "calc(100% - 48px)",
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
          width: "[320px]",
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
  );
};
