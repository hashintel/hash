import MonacoEditor from "@monaco-editor/react";
import { useMemo } from "react";

import { compileVisualizer } from "../../../../../core/helpers/compile-visualizer";
import type {
  DifferentialEquation,
  Place,
  SDCPNType,
} from "../../../../../core/types/sdcpn";
import { Switch } from "../../../../components/switch";
import { useSimulationStore } from "../../../../state/simulation-provider";
import { InitialStateEditor } from "./initial-state-editor";
import { VisualizerErrorBoundary } from "./visualizer-error-boundary";

interface PlacePropertiesProps {
  place: Place;
  types: SDCPNType[];
  differentialEquations: DifferentialEquation[];
  globalMode: "edit" | "simulate";
  onUpdate: (id: string, updates: Partial<Place>) => void;
}

export const PlaceProperties: React.FC<PlacePropertiesProps> = ({
  place,
  types,
  differentialEquations,
  globalMode,
  onUpdate,
}) => {
  const simulation = useSimulationStore((state) => state.simulation);
  const initialMarking = useSimulationStore((state) => state.initialMarking);
  const currentlyViewedFrame = useSimulationStore(
    (state) => state.currentlyViewedFrame,
  );

  // Compile visualizer code once when it changes
  const VisualizerComponent = useMemo(() => {
    if (!place.visualizerCode) {
      return null;
    }

    try {
      return compileVisualizer(place.visualizerCode);
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error("Failed to compile visualizer code:", error);
      return null;
    }
  }, [place.visualizerCode]);

  // Determine current differential equation selection
  const isCustom =
    typeof place.differentialEquationCode === "string" ||
    place.differentialEquationCode === null;
  const selectedDiffEqId =
    place.differentialEquationCode &&
    typeof place.differentialEquationCode === "object"
      ? place.differentialEquationCode.refId
      : "";

  // Filter differential equations by place type
  const availableDiffEqs = place.type
    ? differentialEquations.filter((eq) => eq.typeId === place.type)
    : [];
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div>
        <div style={{ fontWeight: 600, fontSize: 16, marginBottom: 8 }}>
          Place
        </div>
      </div>

      <div>
        <div style={{ fontWeight: 500, fontSize: 12, marginBottom: 4 }}>
          Name
        </div>
        <input
          type="text"
          value={place.name}
          onChange={(event) => {
            onUpdate(place.id, {
              name: event.target.value,
            });
          }}
          disabled={globalMode === "simulate"}
          style={{
            fontSize: 14,
            padding: "6px 8px",
            border: "1px solid rgba(0, 0, 0, 0.1)",
            borderRadius: 4,
            width: "100%",
            boxSizing: "border-box",
            backgroundColor:
              globalMode === "simulate" ? "rgba(0, 0, 0, 0.05)" : "white",
            cursor: globalMode === "simulate" ? "not-allowed" : "text",
          }}
        />
      </div>

      <div>
        <div style={{ fontWeight: 500, fontSize: 12, marginBottom: 4 }}>
          Type
        </div>
        <select
          value={place.type ?? ""}
          onChange={(event) => {
            const value = event.target.value;
            const newType = value === "" ? null : value;
            onUpdate(place.id, {
              type: newType,
              // Disable dynamics if type is being set to null
              ...(newType === null && place.dynamicsEnabled
                ? { dynamicsEnabled: false }
                : {}),
            });
          }}
          disabled={globalMode === "simulate"}
          style={{
            fontSize: 14,
            padding: "6px 8px",
            border: "1px solid rgba(0, 0, 0, 0.1)",
            borderRadius: 4,
            width: "100%",
            boxSizing: "border-box",
            backgroundColor:
              globalMode === "simulate" ? "rgba(0, 0, 0, 0.05)" : "white",
            cursor: globalMode === "simulate" ? "not-allowed" : "pointer",
          }}
        >
          <option value="">None</option>
          {types.map((type) => (
            <option key={type.id} value={type.id}>
              {type.name}
            </option>
          ))}
        </select>
      </div>

      {/* Initial State section - only in Simulate mode */}
      {globalMode === "simulate" &&
        (() => {
          const placeType = place.type
            ? types.find((tp) => tp.id === place.type)
            : null;

          // If no type or type has 0 dimensions, show simple number input
          if (!placeType || placeType.elements.length === 0) {
            return (
              <div>
                <div style={{ fontWeight: 500, fontSize: 12, marginBottom: 4 }}>
                  State
                </div>
                <div>
                  <div
                    style={{ fontWeight: 500, fontSize: 12, marginBottom: 4 }}
                  >
                    Token count
                  </div>
                  <input
                    type="number"
                    min="0"
                    step="1"
                    defaultValue="0"
                    style={{
                      fontSize: 14,
                      padding: "6px 8px",
                      border: "1px solid rgba(0, 0, 0, 0.1)",
                      borderRadius: 4,
                      width: "100%",
                      boxSizing: "border-box",
                    }}
                  />
                </div>
              </div>
            );
          }

          return (
            <InitialStateEditor
              key={place.id}
              placeId={place.id}
              placeType={placeType}
            />
          );
        })()}

      {/* Position - only in Edit mode */}
      {globalMode === "edit" && (
        <div>
          <div style={{ fontWeight: 500, fontSize: 12, marginBottom: 4 }}>
            Position
          </div>
          <div style={{ fontSize: 14 }}>
            x: {place.x.toFixed(0)}, y: {place.y.toFixed(0)}
          </div>
        </div>
      )}

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
              checked={!!place.type && place.dynamicsEnabled}
              disabled={globalMode === "simulate" || place.type === null}
              onCheckedChange={(checked) => {
                onUpdate(place.id, {
                  dynamicsEnabled: checked,
                });
              }}
            />
          </div>
        </div>
        {place.type === null && (
          <div
            style={{
              fontSize: 11,
              color: "#999",
              fontStyle: "italic",
              marginTop: 4,
            }}
          >
            Select a type to enable dynamics
          </div>
        )}
      </div>

      {place.type && place.dynamicsEnabled && (
        <div>
          <div style={{ fontWeight: 500, fontSize: 12, marginBottom: 4 }}>
            Differential Equation
          </div>
          <select
            value={isCustom ? "custom" : selectedDiffEqId}
            onChange={(event) => {
              const value = event.target.value;
              if (value === "custom") {
                // Switch to custom inline code
                onUpdate(place.id, {
                  differentialEquationCode:
                    typeof place.differentialEquationCode === "string"
                      ? place.differentialEquationCode
                      : "",
                });
              } else {
                // Switch to referenced differential equation
                onUpdate(place.id, {
                  differentialEquationCode: { refId: value },
                });
              }
            }}
            disabled={globalMode === "simulate"}
            style={{
              fontSize: 14,
              padding: "6px 8px",
              border: "1px solid rgba(0, 0, 0, 0.1)",
              borderRadius: 4,
              width: "100%",
              boxSizing: "border-box",
              backgroundColor:
                globalMode === "simulate" ? "rgba(0, 0, 0, 0.05)" : "white",
              cursor: globalMode === "simulate" ? "not-allowed" : "pointer",
              marginBottom: 8,
            }}
          >
            <option value="custom">Custom (inline)</option>
            {availableDiffEqs.map((eq) => (
              <option key={eq.id} value={eq.id}>
                {eq.name}
              </option>
            ))}
          </select>

          {isCustom && (
            <div
              style={{
                border: "1px solid rgba(0, 0, 0, 0.1)",
                borderRadius: 4,
                overflow: "hidden",
                height: 310,
              }}
            >
              <MonacoEditor
                language="typescript"
                value={
                  typeof place.differentialEquationCode === "string"
                    ? place.differentialEquationCode
                    : ""
                }
                onChange={(value) => {
                  onUpdate(place.id, {
                    differentialEquationCode: value ?? "",
                  });
                }}
                theme="vs-light"
                options={{
                  minimap: { enabled: false },
                  scrollBeyondLastLine: false,
                  fontSize: 12,
                  lineNumbers: "off",
                  folding: true,
                  glyphMargin: false,
                  lineDecorationsWidth: 0,
                  lineNumbersMinChars: 3,
                  padding: { top: 8, bottom: 8 },
                  readOnly: globalMode === "simulate",
                }}
              />
            </div>
          )}

          {!isCustom && selectedDiffEqId && (
            <div
              style={{
                padding: 8,
                backgroundColor: "rgba(0, 0, 0, 0.03)",
                borderRadius: 4,
                fontSize: 12,
                color: "#666",
              }}
            >
              Using global differential equation:{" "}
              {availableDiffEqs.find((eq) => eq.id === selectedDiffEqId)?.name}
            </div>
          )}
        </div>
      )}

      {/* Visualizer section */}
      {globalMode === "edit" && (
        <div>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              marginBottom: 8,
            }}
          >
            <div style={{ fontWeight: 500, fontSize: 12 }}>Visualizer</div>
            <div style={{ display: "flex", alignItems: "center" }}>
              <Switch
                checked={place.visualizerCode !== null}
                disabled
                onCheckedChange={() => {
                  // Read-only for now
                }}
              />
            </div>
          </div>
        </div>
      )}

      {place.visualizerCode !== null && (
        <div>
          <div style={{ fontWeight: 500, fontSize: 12, marginBottom: 4 }}>
            {globalMode === "simulate" &&
            simulation &&
            simulation.frames.length > 0
              ? "Visualizer Output"
              : "Visualizer Code"}
          </div>
          <div
            style={{
              border: "1px solid rgba(0, 0, 0, 0.1)",
              borderRadius: 4,
              overflow: "hidden",
            }}
          >
            {globalMode === "simulate" ? (
              // Show live token values and parameters during simulation
              (() => {
                // Get place type to determine dimensions
                const placeType = place.type
                  ? types.find((tp) => tp.id === place.type)
                  : null;

                if (!placeType) {
                  return (
                    <div style={{ padding: 12, color: "#666" }}>
                      Place has no type set
                    </div>
                  );
                }

                const dimensions = placeType.elements.length;
                const tokens: number[][] = [];
                let parameters: Record<string, number | boolean> = {};

                // Check if we have simulation frames or use initial marking
                if (simulation && simulation.frames.length > 0) {
                  // Use currently viewed simulation frame
                  const currentFrame = simulation.frames[currentlyViewedFrame];
                  if (!currentFrame) {
                    return (
                      <div style={{ padding: 12, color: "#666" }}>
                        No frame data available
                      </div>
                    );
                  }

                  const placeState = currentFrame.places.get(place.id);
                  if (!placeState) {
                    return (
                      <div style={{ padding: 12, color: "#666" }}>
                        Place not found in frame
                      </div>
                    );
                  }

                  const { offset, count } = placeState;
                  const placeSize = count * dimensions;
                  const tokenValues = Array.from(
                    currentFrame.buffer.slice(offset, offset + placeSize),
                  );

                  // Format tokens as array of arrays
                  for (let i = 0; i < count; i++) {
                    const token: number[] = [];
                    for (let colIndex = 0; colIndex < dimensions; colIndex++) {
                      token.push(tokenValues[i * dimensions + colIndex] ?? 0);
                    }
                    tokens.push(token);
                  }

                  parameters = simulation.parameterValues;
                } else {
                  // Use initial marking
                  const marking = initialMarking.get(place.id);
                  if (marking && marking.count > 0) {
                    for (let i = 0; i < marking.count; i++) {
                      const token: number[] = [];
                      for (
                        let colIndex = 0;
                        colIndex < dimensions;
                        colIndex++
                      ) {
                        token.push(
                          marking.values[i * dimensions + colIndex] ?? 0,
                        );
                      }
                      tokens.push(token);
                    }
                  }

                  // Parameters are empty when simulation hasn't been initialized
                  parameters = {};
                }

                // Render the compiled visualizer component
                if (!VisualizerComponent) {
                  return (
                    <div style={{ padding: 12, color: "#d32f2f" }}>
                      Failed to compile visualizer code. Check console for
                      errors.
                    </div>
                  );
                }

                return (
                  <VisualizerErrorBoundary>
                    <VisualizerComponent
                      tokens={tokens}
                      parameters={parameters}
                    />
                  </VisualizerErrorBoundary>
                );
              })()
            ) : (
              // Show code editor in edit mode
              <MonacoEditor
                language="typescript"
                height={400}
                value={place.visualizerCode}
                theme="vs-light"
                options={{
                  minimap: { enabled: false },
                  scrollBeyondLastLine: false,
                  fontSize: 12,
                  lineNumbers: "off",
                  folding: true,
                  glyphMargin: false,
                  lineDecorationsWidth: 0,
                  lineNumbersMinChars: 3,
                  padding: { top: 8, bottom: 8 },
                  readOnly: true,
                }}
              />
            )}
          </div>
        </div>
      )}
    </div>
  );
};
