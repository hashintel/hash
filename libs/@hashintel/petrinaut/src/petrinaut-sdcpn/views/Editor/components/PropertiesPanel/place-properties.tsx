/* eslint-disable id-length */
import MonacoEditor from "@monaco-editor/react";
import { useEffect, useMemo, useRef, useState } from "react";
import { TbArrowRight, TbDotsVertical, TbSparkles } from "react-icons/tb";

import { Menu } from "../../../../components/menu";
import { Switch } from "../../../../components/switch";
import { InfoIconTooltip, Tooltip } from "../../../../components/tooltip";
import { UI_MESSAGES } from "../../../../constants/ui-messages";
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
import { useSDCPNStore } from "../../../../state/sdcpn-provider";
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
  const isSimulationNotRun = useSimulationStore(
    (state) => state.state === "NotRun",
  );
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

  const availableTypes = useSDCPNStore((state) => state.sdcpn.types);

  // Store previous visualizer code when toggling off (in case user toggled off by mistake)
  const [savedVisualizerCode, setSavedVisualizerCode] = useState<
    string | undefined
  >(undefined);
  useEffect(() => setSavedVisualizerCode(undefined), [place.id]);

  // State for name input validation
  const [nameInputValue, setNameInputValue] = useState(place.name);
  const [nameError, setNameError] = useState<string | null>(null);
  const [isNameInputFocused, setIsNameInputFocused] = useState(false);
  const nameInputRef = useRef<HTMLInputElement>(null);
  const rootDivRef = useRef<HTMLDivElement>(null);

  // Update local state when place changes
  useEffect(() => {
    setNameInputValue(place.name);
    setNameError(null);
  }, [place.id, place.name]);

  // Handle clicks outside when name input is focused
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        isNameInputFocused &&
        rootDivRef.current &&
        !rootDivRef.current.contains(event.target as Node)
      ) {
        // Click is outside the root div and input is focused
        event.stopPropagation();
        event.preventDefault();
        event.stopImmediatePropagation();
        nameInputRef.current?.blur();
      }
    };

    if (isNameInputFocused) {
      // Use capture phase to catch the event before it propagates
      document.addEventListener("click", handleClickOutside, true);
      return () => {
        document.removeEventListener("click", handleClickOutside, true);
      };
    }
  }, [isNameInputFocused]);

  // Validate PascalCase format
  const isPascalCase = (str: string): boolean => {
    if (!str) {
      return false;
    }
    // PascalCase: starts with uppercase, contains letters (and optionally numbers at the end)
    return /^[A-Z][a-zA-Z]*\d*$/.test(str);
  };

  const handleNameBlur = () => {
    if (!nameInputValue.trim()) {
      setNameError("Name cannot be empty");
      return;
    }

    if (!isPascalCase(nameInputValue)) {
      setNameError(
        "Name must be in PascalCase (e.g., MyPlaceName or Place2). Numbers must appear at the end.",
      );
      return;
    }

    // Valid name - update and clear error
    setNameError(null);
    if (nameInputValue !== place.name) {
      onUpdate(place.id, { name: nameInputValue });
    }
  };

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
    <div
      ref={rootDivRef}
      style={{ display: "flex", flexDirection: "column", gap: 12 }}
    >
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
          ref={nameInputRef}
          type="text"
          value={nameInputValue}
          onChange={(event) => {
            setNameInputValue(event.target.value);
            // Clear error when user starts typing
            if (nameError) {
              setNameError(null);
            }
          }}
          onFocus={() => setIsNameInputFocused(true)}
          onBlur={() => {
            setIsNameInputFocused(false);
            handleNameBlur();
          }}
          disabled={globalMode === "simulate"}
          style={{
            fontSize: 14,
            padding: "6px 8px",
            border: `1px solid ${nameError ? "#ef4444" : "rgba(0, 0, 0, 0.1)"}`,
            borderRadius: 4,
            width: "100%",
            boxSizing: "border-box",
            backgroundColor:
              globalMode === "simulate" ? "rgba(0, 0, 0, 0.05)" : "white",
            cursor: globalMode === "simulate" ? "not-allowed" : "text",
          }}
        />
        {nameError && (
          <div
            style={{
              fontSize: 12,
              color: "#ef4444",
              marginTop: 4,
            }}
          >
            {nameError}
          </div>
        )}
      </div>

      <div>
        <div style={{ fontWeight: 500, fontSize: 12, marginBottom: 4 }}>
          Accepted token type
          <InfoIconTooltip
            tooltip={`If tokens in this place should carry data ("colour"), assign a data type here.${availableTypes.length === 0 ? " You must create a data type in the left-hand sidebar first." : ""} Tokens in places don't have to carry data, but they need one to enable dynamics (token data changing over time when in a place).`}
          />
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
            marginBottom: place.type ? 8 : 0,
          }}
        >
          <option value="">None</option>
          {types.map((type) => (
            <option key={type.id} value={type.id}>
              {type.name}
            </option>
          ))}
        </select>

        {place.type && (
          <div style={{ textAlign: "right" }}>
            <button
              type="button"
              onClick={() => {
                setSelectedItemIds(new Set([place.type!]));
              }}
              style={{
                fontSize: 12,
                padding: "4px 8px",
                border: "1px solid rgba(0, 0, 0, 0.2)",
                borderRadius: 4,
                backgroundColor: "white",
                cursor: "pointer",
                color: "#333",
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
              }}
            >
              Jump to Type
              <TbArrowRight style={{ fontSize: 14 }} />
            </button>
          </div>
        )}
      </div>

      <div style={{ marginTop: 10 }}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            marginBottom: 8,
          }}
        >
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
          <div
            style={{
              fontWeight: 500,
              fontSize: 12,
              display: "flex",
              alignItems: "center",
            }}
          >
            Dynamics
            <InfoIconTooltip tooltip="Token data can dynamically change over time when tokens remain in a place, governed by a differential equation." />
          </div>
        </div>
        {(place.type === null || availableDiffEqs.length === 0) && (
          <div
            style={{
              fontSize: 11,
              color: "#999",
              fontStyle: "italic",
              marginTop: 4,
            }}
          >
            {place.type !== null
              ? "Create a differential equation for the selected type in the left-hand sidebar first"
              : availableTypes.length === 0
                ? "Create a type in the left-hand sidebar first, then select it to enable dynamics."
                : "Select a type to enable dynamics"}
          </div>
        )}
      </div>

      {place.type && place.dynamicsEnabled && availableDiffEqs.length > 0 && (
        <div style={{ marginBottom: 25 }}>
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
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 6,
                }}
              >
                Jump to Differential Equation
                <TbArrowRight style={{ fontSize: 14 }} />
              </button>
            </div>
          )}
        </div>
      )}

      {/* Initial State section - only in Simulate mode */}
      {globalMode === "simulate" &&
        (() => {
          const placeType = place.type
            ? types.find((tp) => tp.id === place.type)
            : null;

          // If no type or type has 0 dimensions, show simple number input
          if (!placeType || placeType.elements.length === 0) {
            // Determine if simulation is running
            const hasSimulation =
              simulation !== null && simulation.frames.length > 0;

            // Get token count from simulation frame or initial marking
            let currentTokenCount = 0;
            if (hasSimulation) {
              const currentFrame = simulation.frames[currentlyViewedFrame];
              if (currentFrame) {
                const placeState = currentFrame.places.get(place.id);
                currentTokenCount = placeState?.count ?? 0;
              }
            } else {
              const currentMarking = initialMarking.get(place.id);
              currentTokenCount = currentMarking?.count ?? 0;
            }

            return (
              <div>
                <div
                  style={{
                    fontWeight: 500,
                    fontSize: 12,
                    marginBottom: 4,
                  }}
                >
                  {isSimulationNotRun ? "Initial State" : "State"}
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
                    disabled={hasSimulation}
                    style={{
                      fontSize: 14,
                      padding: "6px 8px",
                      border: "1px solid rgba(0, 0, 0, 0.1)",
                      borderRadius: 4,
                      width: "100%",
                      boxSizing: "border-box",
                      backgroundColor: hasSimulation
                        ? "rgba(0, 0, 0, 0.05)"
                        : "white",
                      cursor: hasSimulation ? "not-allowed" : "text",
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

      {/* Visualizer section */}
      {globalMode === "edit" && (
        <div style={{ marginTop: 10 }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              marginBottom: 8,
            }}
          >
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
            <div
              style={{
                fontWeight: 500,
                fontSize: 12,
                display: "flex",
                alignItems: "center",
              }}
            >
              Visualizer
              <InfoIconTooltip tooltip="You can set a custom visualization for tokens evolving in a place, viewable in this panel when a simulation is running." />
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
                      <Tooltip content={UI_MESSAGES.AI_FEATURE_COMING_SOON}>
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
                      </Tooltip>
                    ),
                    disabled: true,
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

      <div style={{ height: 40 }} />
    </div>
  );
};
