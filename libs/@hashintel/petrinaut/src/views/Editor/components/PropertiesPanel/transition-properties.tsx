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
import MonacoEditor from "@monaco-editor/react";
import { TbDotsVertical, TbSparkles, TbTrash } from "react-icons/tb";

import { Menu } from "../../../../components/menu";
import { SegmentGroup } from "../../../../components/segment-group";
import { InfoIconTooltip, Tooltip } from "../../../../components/tooltip";
import { useSDCPNStore } from "../../../../state/sdcpn-provider";
import { UI_MESSAGES } from "../../../../constants/ui-messages";
import {
  generateDefaultLambdaCode,
  generateDefaultTransitionKernelCode,
} from "../../../../core/default-codes";
import type {
  Place,
  SDCPNType,
  Transition,
} from "../../../../core/types/sdcpn";
import { SortableArcItem } from "./sortable-arc-item";

interface TransitionPropertiesProps {
  transition: Transition;
  places: Place[];
  types: SDCPNType[];
  globalMode: "edit" | "simulate";
  onUpdate: (id: string, updates: Partial<Transition>) => void;
  onArcWeightUpdate: (
    transitionId: string,
    arcType: "input" | "output",
    placeId: string,
    weight: number,
  ) => void;
}

export const TransitionProperties: React.FC<TransitionPropertiesProps> = ({
  transition,
  places,
  types,
  globalMode,
  onUpdate,
  onArcWeightUpdate,
}) => {
  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  const handleInputArcDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;

    if (over && active.id !== over.id) {
      const oldIndex = transition.inputArcs.findIndex(
        (arc) => arc.placeId === active.id,
      );
      const newIndex = transition.inputArcs.findIndex(
        (arc) => arc.placeId === over.id,
      );

      const newInputArcs = arrayMove(transition.inputArcs, oldIndex, newIndex);

      onUpdate(transition.id, {
        inputArcs: newInputArcs,
      });
    }
  };

  const handleOutputArcDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;

    if (over && active.id !== over.id) {
      const oldIndex = transition.outputArcs.findIndex(
        (arc) => arc.placeId === active.id,
      );
      const newIndex = transition.outputArcs.findIndex(
        (arc) => arc.placeId === over.id,
      );

      const newOutputArcs = arrayMove(
        transition.outputArcs,
        oldIndex,
        newIndex,
      );

      onUpdate(transition.id, {
        outputArcs: newOutputArcs,
      });
    }
  };

  const handleDeleteInputArc = (placeId: string) => {
    const newInputArcs = transition.inputArcs.filter(
      (arc) => arc.placeId !== placeId,
    );
    onUpdate(transition.id, {
      inputArcs: newInputArcs,
    });
  };

  const handleDeleteOutputArc = (placeId: string) => {
    const newOutputArcs = transition.outputArcs.filter(
      (arc) => arc.placeId !== placeId,
    );
    onUpdate(transition.id, {
      outputArcs: newOutputArcs,
    });
  };

  const hasOutputPlaceWithType = transition.outputArcs.some((arc) => {
    const place = places.find((p) => p.id === arc.placeId);
    return place && place.type;
  });

  const removeTransition = useSDCPNStore((state) => state.removeTransition);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
          <div style={{ fontWeight: 600, fontSize: 16 }}>
            Transition
          </div>
          <Tooltip content="Delete">
            <button
              type="button"
              onClick={() => {
                if (
                  // eslint-disable-next-line no-alert
                  window.confirm(
                    `Are you sure you want to delete "${transition.name}"? All arcs connected to this transition will also be removed.`,
                  )
                ) {
                  removeTransition(transition.id);
                }
              }}
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                width: 24,
                height: 24,
                padding: 0,
                border: "none",
                background: "transparent",
                cursor: "pointer",
                color: "#6b7280",
                borderRadius: 4,
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.color = "#ef4444";
                e.currentTarget.style.backgroundColor = "rgba(239, 68, 68, 0.1)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.color = "#6b7280";
                e.currentTarget.style.backgroundColor = "transparent";
              }}
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
            onUpdate(transition.id, {
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
              sensors={globalMode === "simulate" ? [] : sensors}
              collisionDetection={closestCenter}
              onDragEnd={handleInputArcDragEnd}
            >
              <SortableContext
                items={transition.inputArcs.map((arc) => arc.placeId)}
                strategy={verticalListSortingStrategy}
              >
                {transition.inputArcs.map((arc) => {
                  const place = places.find(
                    (placeItem) => placeItem.id === arc.placeId,
                  );
                  return (
                    <SortableArcItem
                      key={arc.placeId}
                      id={arc.placeId}
                      placeName={place?.name ?? arc.placeId}
                      weight={arc.weight}
                      disabled={globalMode === "simulate"}
                      onWeightChange={(weight) => {
                        onArcWeightUpdate(
                          transition.id,
                          "input",
                          arc.placeId,
                          weight,
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
              sensors={globalMode === "simulate" ? [] : sensors}
              collisionDetection={closestCenter}
              onDragEnd={handleOutputArcDragEnd}
            >
              <SortableContext
                items={transition.outputArcs.map((arc) => arc.placeId)}
                strategy={verticalListSortingStrategy}
              >
                {transition.outputArcs.map((arc) => {
                  const place = places.find(
                    (placeItem) => placeItem.id === arc.placeId,
                  );
                  return (
                    <SortableArcItem
                      key={arc.placeId}
                      id={arc.placeId}
                      placeName={place?.name ?? arc.placeId}
                      weight={arc.weight}
                      disabled={globalMode === "simulate"}
                      onWeightChange={(weight) => {
                        onArcWeightUpdate(
                          transition.id,
                          "output",
                          arc.placeId,
                          weight,
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
            opacity: globalMode === "simulate" ? 0.6 : 1,
            pointerEvents: globalMode === "simulate" ? "none" : "auto",
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
                onUpdate(transition.id, {
                  lambdaType: value as "predicate" | "stochastic",
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
                    onUpdate(transition.id, {
                      lambdaCode: generateDefaultLambdaCode(
                        transition.lambdaType,
                      ),
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
          }}
        >
          <MonacoEditor
            key={`lambda-${transition.lambdaType}-${transition.inputArcs.map((a) => `${a.placeId}:${a.weight}`).join("-")}`}
            language="typescript"
            value={transition.lambdaCode || ""}
            path={`inmemory://sdcpn/transitions/${transition.id}/lambda.ts`}
            onChange={(value) => {
              onUpdate(transition.id, {
                lambdaCode: value ?? "",
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
                            (p) => p.id === arc.placeId,
                          );
                          if (!place || !place.type) return null;
                          const type = types.find((t) => t.id === place.type);
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
                            (p) => p.id === arc.placeId,
                          );
                          if (!place || !place.type) return null;
                          const type = types.find((t) => t.id === place.type);
                          if (!type) return null;
                          return {
                            placeName: place.name,
                            type,
                            weight: arc.weight,
                          };
                        })
                        .filter((o) => o !== null);

                      onUpdate(transition.id, {
                        transitionKernelCode:
                          generateDefaultTransitionKernelCode(inputs, outputs),
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
            }}
          >
            <MonacoEditor
              key={`kernel-${transition.inputArcs.map((a) => `${a.placeId}:${a.weight}`).join("-")}-${transition.outputArcs.map((a) => `${a.placeId}:${a.weight}`).join("-")}`}
              language="typescript"
              value={transition.transitionKernelCode || ""}
              path={`inmemory://sdcpn/transitions/${transition.id}/transition-kernel.ts`}
              onChange={(value) => {
                onUpdate(transition.id, {
                  transitionKernelCode: value ?? "",
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
