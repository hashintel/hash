/* eslint-disable id-length */
import MonacoEditor from "@monaco-editor/react";
import { useEffect, useMemo, useState } from "react";
import { TbDotsVertical, TbSparkles } from "react-icons/tb";

import { Menu } from "../../../../components/menu";
import { Switch } from "../../../../components/switch";
import {
  DEFAULT_VISUALIZER_CODE,
  generateDefaultVisualizerCode,
} from "../../../../core/default-codes";
import { compileVisualizer } from "../../../../core/helpers/compile-visualizer";
import type {
  DifferentialEquation,
  Place,
  SDCPNType,
} from "../../../../core/types/sdcpn";
import {
  mergeParameterValues,
  useDefaultParameterValues,
} from "../../../../hooks/use-default-parameter-values";
import { useEditorStore } from "../../../../state/editor-provider";
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
  const setInitialMarking = useSimulationStore(
    (state) => state.setInitialMarking,
  );
  const parameterValues = useSimulationStore((state) => state.parameterValues);
  const currentlyViewedFrame = useSimulationStore(
    (state) => state.currentlyViewedFrame,
  );

  const setSelectedItemIds = useEditorStore(
    (state) => state.setSelectedItemIds,
  );

  // Store previous visualizer code when toggling off (in case user toggled off by mistake)
  const [savedVisualizerCode, setSavedVisualizerCode] = useState<
    string | undefined
  >(undefined);
  useEffect(() => setSavedVisualizerCode(undefined), [place.id]);

  // Get default parameter values from SDCPN definition
  const defaultParameterValues = useDefaultParameterValues();

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

  // Get the currently selected differential equation ID
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
          Accepted token type
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
            // Get current token count from initialMarking
            const currentMarking = initialMarking.get(place.id);
            const currentTokenCount = currentMarking?.count ?? 0;

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
                    value={currentTokenCount}
                    onChange={(event) => {
                      const count = Math.max(
                        0,
                        Number.parseInt(event.target.value, 10) || 0,
                      );
                      setInitialMarking(place.id, {
                        values: new Float64Array(0), // Empty array for places without type
                        count,
                      });
                    }}
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
            value={selectedDiffEqId}
            onChange={(event) => {
              const value = event.target.value;
              if (value === "") {
                // No differential equation selected
                onUpdate(place.id, {
                  differentialEquationCode: null,
                });
              } else {
                // Reference a differential equation
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
            <option value="">None</option>
            {availableDiffEqs.map((eq) => (
              <option key={eq.id} value={eq.id}>
                {eq.name}
              </option>
            ))}
          </select>

          {selectedDiffEqId && (
            <div style={{ textAlign: "right" }}>
              <button
                type="button"
                onClick={() => {
                  setSelectedItemIds(new Set([selectedDiffEqId]));
                }}
                style={{
                  fontSize: 12,
                  padding: "4px 8px",
                  border: "1px solid rgba(0, 0, 0, 0.2)",
                  borderRadius: 4,
                  backgroundColor: "white",
                  cursor: "pointer",
                  color: "#333",
                }}
              >
                Jump to Differential Equation
              </button>
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
                checked={place.visualizerCode !== undefined}
                onCheckedChange={(checked) => {
                  if (checked) {
                    // Turning on: use saved code if available, otherwise default
                    onUpdate(place.id, {
                      visualizerCode:
                        savedVisualizerCode ?? DEFAULT_VISUALIZER_CODE,
                    });
                  } else {
                    // Turning off: save current code and set to undefined
                    if (place.visualizerCode) {
                      setSavedVisualizerCode(place.visualizerCode);
                    }
                    onUpdate(place.id, {
                      visualizerCode: undefined,
                    });
                  }
                }}
              />
            </div>
          </div>
        </div>
      )}

      {place.visualizerCode !== undefined && (
        <div>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              marginBottom: 4,
            }}
          >
            <div style={{ fontWeight: 500, fontSize: 12 }}>
              {globalMode === "simulate"
                ? "Visualizer Output"
                : "Visualizer Code"}
            </div>
            {globalMode === "edit" && (
              <Menu
                trigger={
                  <button
                    type="button"
                    style={{
                      background: "transparent",
                      border: "none",
                      cursor: "pointer",
                      padding: 4,
                      display: "flex",
                      alignItems: "center",
                      fontSize: 18,
                      color: "rgba(0, 0, 0, 0.6)",
                    }}
                  >
                    <TbDotsVertical />
                  </button>
                }
                items={[
                  {
                    id: "load-default",
                    label: "Load default template",
                    onClick: () => {
                      // Get the place's type to generate appropriate default code
                      const placeType = place.type
                        ? types.find((t) => t.id === place.type)
                        : null;

                      onUpdate(place.id, {
                        visualizerCode: placeType
                          ? generateDefaultVisualizerCode(placeType)
                          : DEFAULT_VISUALIZER_CODE,
                      });
                    },
                  },
                  {
                    id: "generate-ai",
                    label: (
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 6,
                        }}
                      >
                        <TbSparkles style={{ fontSize: 16 }} />
                        Generate with AI
                      </div>
                    ),
                    onClick: () => {
                      // TODO: Implement AI generation
                    },
                  },
                ]}
              />
            )}
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
                const tokens: Record<string, number>[] = [];
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

                  // Format tokens as array of objects with named dimensions
                  for (let i = 0; i < count; i++) {
                    const token: Record<string, number> = {};
                    for (let colIndex = 0; colIndex < dimensions; colIndex++) {
                      const dimensionName = placeType.elements[colIndex]!.name;
                      token[dimensionName] =
                        tokenValues[i * dimensions + colIndex] ?? 0;
                    }
                    tokens.push(token);
                  }

                  // Merge SimulationStore values with SDCPN defaults
                  parameters = mergeParameterValues(
                    parameterValues,
                    defaultParameterValues,
                  );
                } else {
                  // Use initial marking
                  const marking = initialMarking.get(place.id);
                  if (marking && marking.count > 0) {
                    for (let i = 0; i < marking.count; i++) {
                      const token: Record<string, number> = {};
                      for (
                        let colIndex = 0;
                        colIndex < dimensions;
                        colIndex++
                      ) {
                        const dimensionName =
                          placeType.elements[colIndex]!.name;
                        token[dimensionName] =
                          marking.values[i * dimensions + colIndex] ?? 0;
                      }
                      tokens.push(token);
                    }
                  }

                  // Merge SimulationStore values with SDCPN defaults
                  parameters = mergeParameterValues(
                    parameterValues,
                    defaultParameterValues,
                  );
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
                path={`inmemory://sdcpn/places/${place.id}/visualizer.tsx`}
                height={400}
                value={place.visualizerCode}
                onChange={(value) => {
                  onUpdate(place.id, {
                    visualizerCode: value ?? "",
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
                  fixedOverflowWidgets: true,
                }}
              />
            )}
          </div>
        </div>
      )}
    </div>
  );
};
