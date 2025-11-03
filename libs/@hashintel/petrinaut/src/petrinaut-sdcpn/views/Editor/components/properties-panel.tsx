import { RefractivePane } from "@hashintel/ds-components/refractive-pane";
import { css } from "@hashintel/ds-helpers/css";
import Editor from "@monaco-editor/react";

import { SegmentGroup } from "../../../components/segment-group";
import { Switch } from "../../../components/switch";
import { useEditorStore } from "../../../state/editor-provider";
import { useSDCPNStore } from "../../../state/sdcpn-provider";

/**
 * PropertiesPanel displays properties and controls for the selected node/edge.
 */
export const PropertiesPanel: React.FC = () => {
  const selectedItemIds = useEditorStore((state) => state.selectedItemIds);
  const sdcpn = useSDCPNStore((state) => state.sdcpn);
  const updatePlace = useSDCPNStore((state) => state.updatePlace);
  const updateTransition = useSDCPNStore((state) => state.updateTransition);

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
            Multiple Items Selected ({selectedItemIds.size})
          </div>
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

  // Check if it's a place
  const placeData = sdcpn.places.find((place) => place.id === selectedId);

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
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              marginBottom: 8,
            }}
          >
            <div style={{ fontWeight: 500, fontSize: 12 }}>Dynamics</div>
            <div style={{ display: "flex", alignItems: "center" }}>
              <Switch
                checked={placeData.dynamicsEnabled}
                onCheckedChange={(checked) => {
                  updatePlace(placeData.id, {
                    dynamicsEnabled: checked,
                  });
                }}
              />
            </div>
          </div>
        </div>

        {placeData.dynamicsEnabled && (
          <div>
            <div style={{ fontWeight: 500, fontSize: 12, marginBottom: 4 }}>
              Differential Equation Code
            </div>
            <div
              style={{
                border: "1px solid rgba(0, 0, 0, 0.1)",
                borderRadius: 4,
                overflow: "hidden",
                height: 200,
              }}
            >
              <Editor
                height="200px"
                defaultLanguage="python"
                value={placeData.differentialEquationCode || ""}
                onChange={(value) => {
                  updatePlace(placeData.id, {
                    differentialEquationCode: value ?? "",
                  });
                }}
                theme="vs-light"
                options={{
                  minimap: { enabled: false },
                  scrollBeyondLastLine: false,
                  fontSize: 12,
                  lineNumbers: "on",
                  folding: false,
                  glyphMargin: false,
                  lineDecorationsWidth: 0,
                  lineNumbersMinChars: 3,
                  padding: { top: 8, bottom: 8 },
                }}
              />
            </div>
          </div>
        )}
      </div>
    );
  }

  // Check if it's a transition
  const transitionData = sdcpn.transitions.find(
    (transition) => transition.id === selectedId,
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
                <div key={`input-\${arc.placeId}`} style={{ marginBottom: 4 }}>
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
                <div key={`output-\${arc.placeId}`} style={{ marginBottom: 4 }}>
                  To: {arc.placeId} (weight: {arc.weight})
                </div>
              ))
            )}
          </div>
        </div>

        <div>
          <div style={{ fontWeight: 500, fontSize: 12, marginBottom: 8 }}>
            Lambda
          </div>
          <SegmentGroup
            value={transitionData.lambdaType}
            options={[
              { value: "predicate", label: "Predicate" },
              { value: "stochastic", label: "Stochastic Rate" },
            ]}
            onChange={(value) => {
              updateTransition(transitionData.id, {
                lambdaType: value as "predicate" | "stochastic",
              });
            }}
          />
        </div>

        <div>
          <div
            style={{
              fontSize: 12,
              color: "#666",
              backgroundColor: "rgba(0, 0, 0, 0.03)",
              padding: 8,
              borderRadius: 4,
              lineHeight: 1.5,
            }}
          >
            {transitionData.lambdaType === "predicate"
              ? "Predicate lambda acts as a boolean guard condition that must be satisfied. The transition can only fire when the predicate evaluates to true, enabling discrete control flow."
              : "Stochastic Rate lambda returns a rate value that determines the probability of the transition firing in continuous time."}
          </div>
        </div>

        <div>
          <div style={{ fontWeight: 500, fontSize: 12, marginBottom: 4 }}>
            Lambda Code
          </div>
          <div
            style={{
              border: "1px solid rgba(0, 0, 0, 0.1)",
              borderRadius: 4,
              overflow: "hidden",
              height: 200,
            }}
          >
            <Editor
              height="200px"
              defaultLanguage="python"
              value={transitionData.lambdaCode || ""}
              onChange={(value) => {
                updateTransition(transitionData.id, {
                  lambdaCode: value ?? "",
                });
              }}
              theme="vs-light"
              options={{
                minimap: { enabled: false },
                scrollBeyondLastLine: false,
                fontSize: 12,
                lineNumbers: "on",
                folding: false,
                glyphMargin: false,
                lineDecorationsWidth: 0,
                lineNumbersMinChars: 3,
                padding: { top: 8, bottom: 8 },
              }}
            />
          </div>
        </div>

        <div>
          <div style={{ fontWeight: 500, fontSize: 12, marginBottom: 4 }}>
            Transition Kernel Code
          </div>
          <div
            style={{
              border: "1px solid rgba(0, 0, 0, 0.1)",
              borderRadius: 4,
              overflow: "hidden",
              height: 200,
            }}
          >
            <Editor
              height="200px"
              defaultLanguage="python"
              value={transitionData.transitionKernelCode || ""}
              onChange={(value) => {
                updateTransition(transitionData.id, {
                  transitionKernelCode: value ?? "",
                });
              }}
              theme="vs-light"
              options={{
                minimap: { enabled: false },
                scrollBeyondLastLine: false,
                fontSize: 12,
                lineNumbers: "on",
                folding: false,
                glyphMargin: false,
                lineDecorationsWidth: 0,
                lineNumbersMinChars: 3,
                padding: { top: 8, bottom: 8 },
              }}
            />
          </div>
        </div>
      </div>
    );
  }

  // Check if it's an arc (starts with $A_)
  if (selectedId.startsWith("$A_")) {
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
    }
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
