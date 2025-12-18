/* eslint-disable id-length */
/* eslint-disable curly */
import type { DragEndEvent } from "@dnd-kit/core";
import {
  closestCenter,
  DndContext,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { css } from "@hashintel/ds-helpers/css";
import MonacoEditor from "@monaco-editor/react";
import { TbDotsVertical, TbSparkles, TbTrash } from "react-icons/tb";

import { Menu } from "../../../../components/menu";
import { SegmentGroup } from "../../../../components/segment-group";
import { InfoIconTooltip, Tooltip } from "../../../../components/tooltip";
import { UI_MESSAGES } from "../../../../constants/ui-messages";
import {
  generateDefaultLambdaCode,
  generateDefaultTransitionKernelCode,
} from "../../../../core/default-codes";
import type { Color, Place, Transition } from "../../../../core/types/sdcpn";
import { useSDCPNContext } from "../../../../state/sdcpn-provider";
import { useSimulationStore } from "../../../../state/simulation-provider";
import { SortableArcItem } from "./sortable-arc-item";

interface TransitionPropertiesProps {
  transition: Transition;
  places: Place[];
  types: Color[];
  globalMode: "edit" | "simulate";
  updateTransition: (
    id: string,
    updateFn: (existingTransition: Transition) => void
  ) => void;
  onArcWeightUpdate: (
    transitionId: string,
    arcType: "input" | "output",
    placeId: string,
    weight: number
  ) => void;
}

export const TransitionProperties: React.FC<TransitionPropertiesProps> = ({
  transition,
  places,
  types,
  globalMode,
  updateTransition,
  onArcWeightUpdate,
}) => {
  const simulationState = useSimulationStore((state) => state.state);

  // Check if simulation is running or paused
  const isSimulationActive =
    simulationState === "Running" || simulationState === "Paused";
  const isReadOnly = globalMode === "simulate" || isSimulationActive;

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const handleInputArcDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;

    if (over && active.id !== over.id) {
      const oldIndex = transition.inputArcs.findIndex(
        (arc) => arc.placeId === active.id
      );
      const newIndex = transition.inputArcs.findIndex(
        (arc) => arc.placeId === over.id
      );

      updateTransition(transition.id, (existingTransition) => {
        existingTransition.inputArcs = arrayMove(
          existingTransition.inputArcs,
          oldIndex,
          newIndex
        );
      });
    }
  };

  const handleOutputArcDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;

    if (over && active.id !== over.id) {
      const oldIndex = transition.outputArcs.findIndex(
        (arc) => arc.placeId === active.id
      );
      const newIndex = transition.outputArcs.findIndex(
        (arc) => arc.placeId === over.id
      );

      updateTransition(transition.id, (existingTransition) => {
        existingTransition.outputArcs = arrayMove(
          existingTransition.outputArcs,
          oldIndex,
          newIndex
        );
      });
    }
  };

  const handleDeleteInputArc = (placeId: string) => {
    updateTransition(transition.id, (existingTransition) => {
      const index = existingTransition.inputArcs.findIndex(
        (arc) => arc.placeId === placeId
      );
      if (index !== -1) {
        existingTransition.inputArcs.splice(index, 1);
      }
    });
  };

  const handleDeleteOutputArc = (placeId: string) => {
    updateTransition(transition.id, (existingTransition) => {
      const index = existingTransition.outputArcs.findIndex(
        (arc) => arc.placeId === placeId
      );
      if (index !== -1) {
        existingTransition.outputArcs.splice(index, 1);
      }
    });
  };

  const hasOutputPlaceWithType = transition.outputArcs.some((arc) => {
    const place = places.find((p) => p.id === arc.placeId);
    return place && place.colorId;
  });

  const { removeTransition } = useSDCPNContext();

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: 8,
          }}
        >
          <div style={{ fontWeight: 600, fontSize: 16 }}>Transition</div>
          <Tooltip content="Delete">
            <button
              type="button"
              onClick={() => {
                if (
                  // eslint-disable-next-line no-alert
                  window.confirm(
                    `Are you sure you want to delete "${transition.name}"? All arcs connected to this transition will also be removed.`
                  )
                ) {
                  removeTransition(transition.id);
                }
              }}
              className={css({
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
              })}
            >
              <TbTrash size={16} />
            </button>
          </Tooltip>
        </div>
      </div>

      <div>
        <div style={{ fontWeight: 500, fontSize: 12, marginBottom: 4 }}>
          Name
        </div>
        <input
          type="text"
          value={transition.name}
          onChange={(event) => {
            updateTransition(transition.id, (existingTransition) => {
              existingTransition.name = event.target.value;
            });
          }}
          disabled={isReadOnly}
          style={{
            fontSize: 14,
            padding: "6px 8px",
            border: "1px solid rgba(0, 0, 0, 0.1)",
            borderRadius: 4,
            width: "100%",
            boxSizing: "border-box",
            backgroundColor: isReadOnly ? "rgba(0, 0, 0, 0.05)" : "white",
            cursor: isReadOnly ? "not-allowed" : "text",
          }}
        />
      </div>

      <div style={{ marginTop: 20 }}>
        <div style={{ fontWeight: 500, fontSize: 12, marginBottom: 4 }}>
          Input Arcs
        </div>
        {transition.inputArcs.length === 0 ? (
          <div style={{ fontSize: 12, color: "#999" }}>
            Connect inputs to the transition's left side.
          </div>
        ) : (
          <div
            style={{
              border: "1px solid rgba(0, 0, 0, 0.1)",
              borderRadius: 6,
              overflow: "hidden",
            }}
          >
            <DndContext
              sensors={isReadOnly ? [] : sensors}
              collisionDetection={closestCenter}
              onDragEnd={handleInputArcDragEnd}
            >
              <SortableContext
                items={transition.inputArcs.map((arc) => arc.placeId)}
                strategy={verticalListSortingStrategy}
              >
                {transition.inputArcs.map((arc) => {
                  const place = places.find(
                    (placeItem) => placeItem.id === arc.placeId
                  );
                  return (
                    <SortableArcItem
                      key={arc.placeId}
                      id={arc.placeId}
                      placeName={place?.name ?? arc.placeId}
                      weight={arc.weight}
                      disabled={isReadOnly}
                      onWeightChange={(weight) => {
                        onArcWeightUpdate(
                          transition.id,
                          "input",
                          arc.placeId,
                          weight
                        );
                      }}
                      onDelete={() => handleDeleteInputArc(arc.placeId)}
                    />
                  );
                })}
              </SortableContext>
            </DndContext>
          </div>
        )}
      </div>

      <div>
        <div style={{ fontWeight: 500, fontSize: 12, marginBottom: 4 }}>
          Output Arcs
        </div>
        {transition.outputArcs.length === 0 ? (
          <div style={{ fontSize: 12, color: "#999" }}>
            Connect outputs to the transition's right side.
          </div>
        ) : (
          <div
            style={{
              border: "1px solid rgba(0, 0, 0, 0.1)",
              borderRadius: 6,
              overflow: "hidden",
            }}
          >
            <DndContext
              sensors={isReadOnly ? [] : sensors}
              collisionDetection={closestCenter}
              onDragEnd={handleOutputArcDragEnd}
            >
              <SortableContext
                items={transition.outputArcs.map((arc) => arc.placeId)}
                strategy={verticalListSortingStrategy}
              >
                {transition.outputArcs.map((arc) => {
                  const place = places.find(
                    (placeItem) => placeItem.id === arc.placeId
                  );
                  return (
                    <SortableArcItem
                      key={arc.placeId}
                      id={arc.placeId}
                      placeName={place?.name ?? arc.placeId}
                      weight={arc.weight}
                      disabled={isReadOnly}
                      onWeightChange={(weight) => {
                        onArcWeightUpdate(
                          transition.id,
                          "output",
                          arc.placeId,
                          weight
                        );
                      }}
                      onDelete={() => handleDeleteOutputArc(arc.placeId)}
                    />
                  );
                })}
              </SortableContext>
            </DndContext>
          </div>
        )}
      </div>

      <div style={{ marginTop: 20 }}>
        <div style={{ fontWeight: 500, fontSize: 13, marginBottom: 8 }}>
          Firing time
          <InfoIconTooltip tooltip="Define the rate at or conditions under which this will transition will fire, optionally based on each set of input tokens' data (where input tokens have types)." />
        </div>
        <div
          style={{
            opacity: isReadOnly ? 0.6 : 1,
            pointerEvents: isReadOnly ? "none" : "auto",
          }}
        >
          <SegmentGroup
            value={transition.lambdaType}
            options={[
              { value: "predicate", label: "Predicate" },
              { value: "stochastic", label: "Stochastic Rate" },
            ]}
            onChange={(value) => {
              if (globalMode !== "simulate") {
                updateTransition(transition.id, (existingTransition) => {
                  existingTransition.lambdaType = value as
                    | "predicate"
                    | "stochastic";
                });
              }
            }}
          />
        </div>
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
          {transition.lambdaType === "predicate"
            ? "For a simple predicate firing check, define a boolean guard condition that must be satisfied. The transition will fire when the function returns true, enabling discrete control flow."
            : "For a stochastic firing rate, return a value that represents the average rate per second at which the transition will fire."}
        </div>
      </div>

      <div>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            marginBottom: 4,
            height: 30,
          }}
        >
          <div
            style={{
              fontWeight: 500,
              fontSize: 12,
            }}
          >
            {transition.lambdaType === "predicate"
              ? "Predicate Firing Code"
              : "Stochastic Firing Rate Code"}
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
                    updateTransition(transition.id, (existingTransition) => {
                      existingTransition.lambdaCode = generateDefaultLambdaCode(
                        existingTransition.lambdaType
                      );
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
            height: 340,
            filter: isReadOnly ? "grayscale(20%) brightness(98%)" : "none",
            pointerEvents: isReadOnly ? "none" : "auto",
          }}
        >
          <MonacoEditor
            key={`lambda-${transition.lambdaType}-${transition.inputArcs
              .map((a) => `${a.placeId}:${a.weight}`)
              .join("-")}`}
            language="typescript"
            value={transition.lambdaCode || ""}
            path={`inmemory://sdcpn/transitions/${transition.id}/lambda.ts`}
            onChange={(value) => {
              updateTransition(transition.id, (existingTransition) => {
                existingTransition.lambdaCode = value ?? "";
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
              readOnly: isReadOnly,
              fixedOverflowWidgets: true,
            }}
          />
        </div>
      </div>

      {/* Only show Transition Results if at least one output place has a type */}
      {hasOutputPlaceWithType ? (
        <div>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              marginBottom: 4,
              marginTop: 20,
              height: 30,
            }}
          >
            <div style={{ fontWeight: 500, fontSize: 13 }}>
              Transition Results
              <InfoIconTooltip tooltip="This function determines the data for output tokens, optionally based on the input token data and any global parameters defined." />
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
                      // Build input and output arc information for code generation
                      const inputs = transition.inputArcs
                        .map((arc) => {
                          const place = places.find(
                            (p) => p.id === arc.placeId
                          );
                          if (!place || !place.colorId) return null;
                          const type = types.find(
                            (t) => t.id === place.colorId
                          );
                          if (!type) return null;
                          return {
                            placeName: place.name,
                            type,
                            weight: arc.weight,
                          };
                        })
                        .filter((i) => i !== null);

                      const outputs = transition.outputArcs
                        .map((arc) => {
                          const place = places.find(
                            (p) => p.id === arc.placeId
                          );
                          if (!place || !place.colorId) return null;
                          const type = types.find(
                            (t) => t.id === place.colorId
                          );
                          if (!type) return null;
                          return {
                            placeName: place.name,
                            type,
                            weight: arc.weight,
                          };
                        })
                        .filter((o) => o !== null);

                      updateTransition(transition.id, (existingTransition) => {
                        existingTransition.transitionKernelCode =
                          generateDefaultTransitionKernelCode(inputs, outputs);
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
              height: 400,
              filter: isReadOnly ? "grayscale(20%) brightness(98%)" : "none",
              pointerEvents: isReadOnly ? "none" : "auto",
            }}
          >
            <MonacoEditor
              key={`kernel-${transition.inputArcs
                .map((a) => `${a.placeId}:${a.weight}`)
                .join("-")}-${transition.outputArcs
                .map((a) => `${a.placeId}:${a.weight}`)
                .join("-")}`}
              language="typescript"
              value={transition.transitionKernelCode || ""}
              path={`inmemory://sdcpn/transitions/${transition.id}/transition-kernel.ts`}
              onChange={(value) => {
                updateTransition(transition.id, (existingTransition) => {
                  existingTransition.transitionKernelCode = value ?? "";
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
                readOnly: isReadOnly,
                fixedOverflowWidgets: true,
              }}
            />
          </div>
        </div>
      ) : (
        <div
          style={{
            backgroundColor: "rgba(0, 0, 0, 0.03)",
            border: "1px solid rgba(0, 0, 0, 0.1)",
            borderRadius: 4,
            padding: 12,
            fontSize: 12,
            color: "#666",
            lineHeight: 1.5,
            marginTop: 20,
          }}
        >
          <div style={{ fontWeight: 500, marginBottom: 4 }}>
            Transition Results
          </div>
          <div>
            The Transition Results section is not available because none of the
            output places have a type defined. To enable this feature, assign a
            type to at least one output place.
          </div>
        </div>
      )}

      <div style={{ height: 40 }} />
    </div>
  );
};
