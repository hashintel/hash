/* eslint-disable id-length */
import { css, cva } from "@hashintel/ds-helpers/css";
import MonacoEditor from "@monaco-editor/react";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  TbArrowRight,
  TbDotsVertical,
  TbSparkles,
  TbTrash,
} from "react-icons/tb";

import { Menu } from "../../../../components/menu";
import { Switch } from "../../../../components/switch";
import { InfoIconTooltip, Tooltip } from "../../../../components/tooltip";
import { UI_MESSAGES } from "../../../../constants/ui-messages";
import {
  DEFAULT_VISUALIZER_CODE,
  generateDefaultVisualizerCode,
} from "../../../../core/default-codes";
import { compileVisualizer } from "../../../../core/simulation/compile-visualizer";
import type {
  Color,
  DifferentialEquation,
  Place,
} from "../../../../core/types/sdcpn";
import {
  mergeParameterValues,
  useDefaultParameterValues,
} from "../../../../hooks/use-default-parameter-values";
import { useEditorStore } from "../../../../state/editor-provider";
import { useSDCPNContext } from "../../../../state/sdcpn-provider";
import { useSimulationStore } from "../../../../state/simulation-provider";
import { useIsReadOnly } from "../../../../state/use-is-read-only";
import { InitialStateEditor } from "./initial-state-editor";
import { VisualizerErrorBoundary } from "./visualizer-error-boundary";

const containerStyle = css({
  display: "flex",
  flexDirection: "column",
  gap: "[12px]",
});

const headerContainerStyle = css({
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  marginBottom: "[8px]",
});

const headerTitleStyle = css({
  fontWeight: 600,
  fontSize: "[16px]",
});

const deleteButtonStyle = css({
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  width: "[24px]",
  height: "[24px]",
  padding: "spacing.0",
  border: "none",
  background: "[transparent]",
  cursor: "pointer",
  color: "core.gray.60",
  borderRadius: "radius.4",
  _hover: {
    color: "core.red.60",
    backgroundColor: "core.red.10",
  },
});

const fieldLabelStyle = css({
  fontWeight: 500,
  fontSize: "[12px]",
  marginBottom: "[4px]",
});

const fieldLabelWithTooltipStyle = css({
  fontWeight: 500,
  fontSize: "[12px]",
  marginBottom: "[4px]",
  display: "flex",
  alignItems: "center",
});

const inputStyle = cva({
  base: {
    fontSize: "[14px]",
    padding: "[6px 8px]",
    borderRadius: "[4px]",
    width: "[100%]",
    boxSizing: "border-box",
  },
  variants: {
    isReadOnly: {
      true: {
        backgroundColor: "[rgba(0, 0, 0, 0.05)]",
        cursor: "not-allowed",
      },
      false: {
        backgroundColor: "[white]",
        cursor: "text",
      },
    },
    hasError: {
      true: {
        border: "[1px solid #ef4444]",
      },
      false: {
        border: "[1px solid rgba(0, 0, 0, 0.1)]",
      },
    },
  },
  defaultVariants: {
    isReadOnly: false,
    hasError: false,
  },
});

const errorMessageStyle = css({
  fontSize: "[12px]",
  color: "[#ef4444]",
  marginTop: "[4px]",
});

const selectStyle = cva({
  base: {
    fontSize: "[14px]",
    padding: "[6px 8px]",
    border: "[1px solid rgba(0, 0, 0, 0.1)]",
    borderRadius: "[4px]",
    width: "[100%]",
    boxSizing: "border-box",
  },
  variants: {
    isReadOnly: {
      true: {
        backgroundColor: "[rgba(0, 0, 0, 0.05)]",
        cursor: "not-allowed",
      },
      false: {
        backgroundColor: "[white]",
        cursor: "pointer",
      },
    },
    hasMarginBottom: {
      true: {
        marginBottom: "[8px]",
      },
      false: {},
    },
  },
});

const jumpButtonContainerStyle = css({
  textAlign: "right",
});

const jumpButtonStyle = css({
  fontSize: "[12px]",
  padding: "[4px 8px]",
  border: "[1px solid rgba(0, 0, 0, 0.2)]",
  borderRadius: "[4px]",
  backgroundColor: "[white]",
  cursor: "pointer",
  color: "[#333]",
  display: "inline-flex",
  alignItems: "center",
  gap: "[6px]",
});

const jumpIconStyle = css({
  fontSize: "[14px]",
});

const sectionContainerStyle = css({
  marginTop: "[10px]",
});

const switchRowStyle = css({
  display: "flex",
  alignItems: "center",
  gap: "[8px]",
  marginBottom: "[8px]",
});

const switchContainerStyle = css({
  display: "flex",
  alignItems: "center",
});

const hintTextStyle = css({
  fontSize: "[11px]",
  color: "[#999]",
  fontStyle: "italic",
  marginTop: "[4px]",
});

const diffEqContainerStyle = css({
  marginBottom: "[25px]",
});

const menuButtonStyle = css({
  background: "[transparent]",
  border: "none",
  cursor: "pointer",
  padding: "[4px]",
  display: "flex",
  alignItems: "center",
  fontSize: "[18px]",
  color: "[rgba(0, 0, 0, 0.6)]",
});

const codeHeaderStyle = css({
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  marginBottom: "[4px]",
});

const codeHeaderLabelStyle = css({
  fontWeight: 500,
  fontSize: "[12px]",
});

const editorBorderStyle = css({
  border: "[1px solid rgba(0, 0, 0, 0.1)]",
  borderRadius: "[4px]",
  overflow: "hidden",
});

const aiMenuItemStyle = css({
  display: "flex",
  alignItems: "center",
  gap: "[6px]",
});

const aiIconStyle = css({
  fontSize: "[16px]",
});

const visualizerMessageStyle = css({
  padding: "[12px]",
  color: "[#666]",
});

const visualizerErrorStyle = css({
  padding: "[12px]",
  color: "[#d32f2f]",
});

const spacerStyle = css({
  height: "[40px]",
});

interface PlacePropertiesProps {
  place: Place;
  types: Color[];
  differentialEquations: DifferentialEquation[];
  updatePlace: (placeId: string, updateFn: (place: Place) => void) => void;
}

export const PlaceProperties: React.FC<PlacePropertiesProps> = ({
  place,
  types,
  differentialEquations,
  updatePlace,
}) => {
  const simulation = useSimulationStore((state) => state.simulation);
  const isReadOnly = useIsReadOnly();
  const globalMode = useEditorStore((state) => state.globalMode);
  const initialMarking = useSimulationStore((state) => state.initialMarking);
  const setInitialMarking = useSimulationStore(
    (state) => state.setInitialMarking,
  );
  const parameterValues = useSimulationStore((state) => state.parameterValues);
  const currentlyViewedFrame = useSimulationStore(
    (state) => state.currentlyViewedFrame,
  );

  const setSelectedResourceId = useEditorStore(
    (state) => state.setSelectedResourceId,
  );

  const {
    petriNetDefinition: { types: availableTypes },
  } = useSDCPNContext();

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
        "Name must be in PascalCase (e.g., MyPlaceName or Place2). Any numbers must appear at the end.",
      );
      return;
    }

    // Valid name - update and clear error
    setNameError(null);
    if (nameInputValue !== place.name) {
      updatePlace(place.id, (existingPlace) => {
        existingPlace.name = nameInputValue;
      });
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

  // Filter differential equations by place type
  const availableDiffEqs = place.colorId
    ? differentialEquations.filter((eq) => eq.colorId === place.colorId)
    : [];

  const { removePlace } = useSDCPNContext();

  return (
    <div ref={rootDivRef} className={containerStyle}>
      <div>
        <div className={headerContainerStyle}>
          <div className={headerTitleStyle}>Place</div>
          <Tooltip content="Delete">
            <button
              type="button"
              onClick={() => {
                if (
                  // eslint-disable-next-line no-alert
                  window.confirm(
                    `Are you sure you want to delete "${place.name}"? All arcs connected to this place will also be removed.`,
                  )
                ) {
                  removePlace(place.id);
                }
              }}
              className={deleteButtonStyle}
            >
              <TbTrash size={16} />
            </button>
          </Tooltip>
        </div>
      </div>

      <div>
        <div className={fieldLabelStyle}>Name</div>
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
          disabled={isReadOnly}
          className={inputStyle({ isReadOnly, hasError: !!nameError })}
        />
        {nameError && <div className={errorMessageStyle}>{nameError}</div>}
      </div>

      <div>
        <div className={fieldLabelStyle}>
          Accepted token type
          <InfoIconTooltip
            tooltip={`If tokens in this place should carry data ("colour"), assign a data type here.${
              availableTypes.length === 0
                ? " You must create a data type in the left-hand sidebar first."
                : ""
            } Tokens in places don't have to carry data, but they need one to enable dynamics (token data changing over time when in a place).`}
          />
        </div>
        <select
          value={place.colorId ?? ""}
          onChange={(event) => {
            const value = event.target.value;
            const newType = value === "" ? null : value;
            updatePlace(place.id, (existingPlace) => {
              existingPlace.colorId = newType;
              // Disable dynamics if type is being set to null
              if (newType === null && existingPlace.dynamicsEnabled) {
                existingPlace.dynamicsEnabled = false;
              }
            });
          }}
          disabled={isReadOnly}
          className={selectStyle({
            isReadOnly,
            hasMarginBottom: !!place.colorId,
          })}
        >
          <option value="">None</option>
          {types.map((type) => (
            <option key={type.id} value={type.id}>
              {type.name}
            </option>
          ))}
        </select>

        {place.colorId && (
          <div className={jumpButtonContainerStyle}>
            <button
              type="button"
              onClick={() => {
                setSelectedResourceId(place.colorId);
              }}
              className={jumpButtonStyle}
            >
              Jump to Type
              <TbArrowRight className={jumpIconStyle} />
            </button>
          </div>
        )}
      </div>

      <div className={sectionContainerStyle}>
        <div className={switchRowStyle}>
          <div className={switchContainerStyle}>
            <Switch
              checked={!!place.colorId && place.dynamicsEnabled}
              disabled={isReadOnly || place.colorId === null}
              onCheckedChange={(checked) => {
                updatePlace(place.id, (existingPlace) => {
                  existingPlace.dynamicsEnabled = checked;
                });
              }}
            />
          </div>
          <div className={fieldLabelWithTooltipStyle}>
            Dynamics
            <InfoIconTooltip tooltip="Token data can dynamically change over time when tokens remain in a place, governed by a differential equation." />
          </div>
        </div>
        {(place.colorId === null || availableDiffEqs.length === 0) && (
          <div className={hintTextStyle}>
            {place.colorId !== null
              ? "Create a differential equation for the selected type in the left-hand sidebar first"
              : availableTypes.length === 0
                ? "Create a type in the left-hand sidebar first, then select it to enable dynamics."
                : "Select a type to enable dynamics"}
          </div>
        )}
      </div>

      {place.colorId &&
        place.dynamicsEnabled &&
        availableDiffEqs.length > 0 && (
          <div className={diffEqContainerStyle}>
            <div className={fieldLabelStyle}>Differential Equation</div>
            <select
              value={place.differentialEquationId ?? undefined}
              onChange={(event) => {
                const value = event.target.value;

                updatePlace(place.id, (existingPlace) => {
                  existingPlace.differentialEquationId = value || null;
                });
              }}
              disabled={isReadOnly}
              className={selectStyle({ isReadOnly, hasMarginBottom: true })}
            >
              <option value="">None</option>
              {availableDiffEqs.map((eq) => (
                <option key={eq.id} value={eq.id}>
                  {eq.name}
                </option>
              ))}
            </select>

            {place.differentialEquationId && (
              <div className={jumpButtonContainerStyle}>
                <button
                  type="button"
                  onClick={() => {
                    setSelectedResourceId(place.differentialEquationId);
                  }}
                  className={jumpButtonStyle}
                >
                  Jump to Differential Equation
                  <TbArrowRight className={jumpIconStyle} />
                </button>
              </div>
            )}
          </div>
        )}

      {/* Initial State section - shown in both Edit and Simulate modes */}
      {(() => {
        const placeType = place.colorId
          ? types.find((tp) => tp.id === place.colorId)
          : null;

        // Determine if simulation is running (has frames)
        const hasSimulationFrames =
          simulation !== null && simulation.frames.length > 0;

        // If no type or type has 0 dimensions, show simple number input
        if (!placeType || placeType.elements.length === 0) {
          // Get token count from simulation frame or initial marking
          let currentTokenCount = 0;
          if (hasSimulationFrames) {
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
              <div className={fieldLabelStyle}>
                {hasSimulationFrames ? "State" : "Initial State"}
              </div>
              <div>
                <div className={fieldLabelStyle}>Token count</div>
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
                  disabled={hasSimulationFrames}
                  className={inputStyle({ isReadOnly: hasSimulationFrames })}
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
        <div className={sectionContainerStyle}>
          <div className={switchRowStyle}>
            <div className={switchContainerStyle}>
              <Switch
                checked={place.visualizerCode !== undefined}
                onCheckedChange={(checked) => {
                  if (checked) {
                    // Turning on: use saved code if available, otherwise default
                    updatePlace(place.id, (existingPlace) => {
                      existingPlace.visualizerCode =
                        savedVisualizerCode ?? DEFAULT_VISUALIZER_CODE;
                    });
                  } else {
                    // Turning off: save current code and set to undefined
                    if (place.visualizerCode) {
                      setSavedVisualizerCode(place.visualizerCode);
                    }
                    updatePlace(place.id, (existingPlace) => {
                      existingPlace.visualizerCode = undefined;
                    });
                  }
                }}
              />
            </div>
            <div className={fieldLabelWithTooltipStyle}>
              Visualizer
              <InfoIconTooltip tooltip="You can set a custom visualization for tokens evolving in a place, viewable in this panel when a simulation is running." />
            </div>
          </div>
        </div>
      )}

      {place.visualizerCode !== undefined && (
        <div>
          {(() => {
            // Determine if we should show visualization (when simulation has frames)
            const hasSimulationFrames =
              simulation !== null && simulation.frames.length > 0;
            const showVisualization = isReadOnly || hasSimulationFrames;

            return (
              <>
                <div className={codeHeaderStyle}>
                  <div className={codeHeaderLabelStyle}>
                    {showVisualization
                      ? "Visualizer Output"
                      : "Visualizer Code"}
                  </div>
                  {!showVisualization && (
                    <Menu
                      trigger={
                        <button type="button" className={menuButtonStyle}>
                          <TbDotsVertical />
                        </button>
                      }
                      items={[
                        {
                          id: "load-default",
                          label: "Load default template",
                          onClick: () => {
                            // Get the place's type to generate appropriate default code
                            const placeType = place.colorId
                              ? types.find((t) => t.id === place.colorId)
                              : null;

                            updatePlace(place.id, (existingPlace) => {
                              existingPlace.visualizerCode = placeType
                                ? generateDefaultVisualizerCode(placeType)
                                : DEFAULT_VISUALIZER_CODE;
                            });
                          },
                        },
                        {
                          id: "generate-ai",
                          label: (
                            <Tooltip
                              content={UI_MESSAGES.AI_FEATURE_COMING_SOON}
                            >
                              <div className={aiMenuItemStyle}>
                                <TbSparkles className={aiIconStyle} />
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
                <div className={editorBorderStyle}>
                  {showVisualization ? (
                    // Show live token values and parameters during simulation
                    (() => {
                      // Get place type to determine dimensions
                      const placeType = place.colorId
                        ? types.find((tp) => tp.id === place.colorId)
                        : null;

                      if (!placeType) {
                        return (
                          <div className={visualizerMessageStyle}>
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
                        const currentFrame =
                          simulation.frames[currentlyViewedFrame];
                        if (!currentFrame) {
                          return (
                            <div className={visualizerMessageStyle}>
                              No frame data available
                            </div>
                          );
                        }

                        const placeState = currentFrame.places.get(place.id);
                        if (!placeState) {
                          return (
                            <div className={visualizerMessageStyle}>
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
                          for (
                            let colIndex = 0;
                            colIndex < dimensions;
                            colIndex++
                          ) {
                            const dimensionName =
                              placeType.elements[colIndex]!.name;
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
                          <div className={visualizerErrorStyle}>
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
                      key={`visualizer-${place.colorId ?? "no-type"}`}
                      language="typescript"
                      path={`inmemory://sdcpn/places/${place.id}/visualizer.tsx`}
                      height={400}
                      value={place.visualizerCode}
                      onChange={(value) => {
                        updatePlace(place.id, (existingPlace) => {
                          existingPlace.visualizerCode = value ?? "";
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
              </>
            );
          })()}
        </div>
      )}

      <div className={spacerStyle} />
    </div>
  );
};
