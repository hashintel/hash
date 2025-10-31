import { css } from "@hashintel/ds-helpers/css";
import { useCallback, useMemo, useState } from "react";

import { Button } from "./components/button";
import { Checkbox } from "./components/checkbox";
import { Dialog } from "./components/dialog";
import { Select } from "./components/select";
import { Slider } from "./components/slider";
import { Switch } from "./components/switch";
import { TextField } from "./components/text-field";
import { useEditorContext } from "./editor-context";
import { generateUuid } from "./lib/generate-uuid";
import { NetSelector } from "./net-selector";
import type {
  ArcType,
  PlaceNodeType,
  TransitionCondition,
  TransitionNodeData,
  TransitionNodeType,
} from "./types";

const normalizeProbabilities = (
  conditions: TransitionCondition[],
): TransitionCondition[] => {
  if (conditions.length === 0) {
    return [];
  }

  if (conditions.length === 1) {
    return [
      {
        ...conditions[0]!,
        probability: 100,
      },
    ];
  }

  const totalProbability = conditions.reduce(
    (sum, condition) => sum + condition.probability,
    0,
  );

  if (totalProbability === 100) {
    return conditions;
  }

  const factor = 100 / totalProbability;
  const normalizedConditions = conditions.map((condition) => ({
    ...condition,
    probability: Math.round(condition.probability * factor),
  }));

  // Fix any rounding errors by adjusting the first condition
  const newTotal = normalizedConditions.reduce(
    (sum, condition) => sum + condition.probability,
    0,
  );

  if (newTotal !== 100 && normalizedConditions.length > 0) {
    normalizedConditions[0] = {
      ...normalizedConditions[0]!,
      probability: normalizedConditions[0]!.probability + (100 - newTotal),
    };
  }

  return normalizedConditions;
};

const distributeRemovedProbability = (
  conditions: TransitionCondition[],
  removedProbability: number,
): TransitionCondition[] => {
  if (conditions.length === 0) {
    return [];
  }
  if (conditions.length === 1) {
    return normalizeProbabilities(conditions);
  }

  const totalRemainingProbability = conditions.reduce(
    (sum, condition) => sum + condition.probability,
    0,
  );

  const distributionFactor =
    totalRemainingProbability > 0
      ? removedProbability / totalRemainingProbability
      : 0;

  return normalizeProbabilities(
    conditions.map((condition) => ({
      ...condition,
      probability: Math.round(condition.probability * (1 + distributionFactor)),
    })),
  );
};

const distributeEvenlyWithRemainder = (count: number): number[] => {
  const targetProbability = Math.floor(100 / count);
  const remainder = 100 - targetProbability * count;

  return Array(count)
    .fill(targetProbability)
    .map((prob: number, idx) => (idx === 0 ? prob + remainder : prob));
};

type TransitionEditorProps = {
  open: boolean;
  onClose: () => void;
  transitionId: string;
  outgoingEdges: Array<
    ArcType & {
      targetLabel: string;
    }
  >;
  onUpdateTransition: (
    transitionId: string,
    data: Omit<TransitionNodeData, "type">,
  ) => void;
};

export const TransitionEditor = ({
  open,
  onClose,
  transitionId,
  outgoingEdges,
  onUpdateTransition,
}: TransitionEditorProps) => {
  const { petriNetDefinition } = useEditorContext();

  const { transitionNode, allInputPlaces, allOutputPlaces } = useMemo(() => {
    const node = petriNetDefinition.nodes.find(
      (option): option is TransitionNodeType =>
        option.data.type === "transition" && option.id === transitionId,
    );

    if (!node) {
      throw new Error("Transition node not found");
    }

    const inputPlaces: PlaceNodeType[] = [];
    const outputPlaces: PlaceNodeType[] = [];

    for (const arc of petriNetDefinition.arcs) {
      if (arc.source === transitionId) {
        const outputPlace = petriNetDefinition.nodes.find(
          (option): option is PlaceNodeType =>
            option.type === "place" && option.id === arc.target,
        );

        if (!outputPlace) {
          throw new Error("Output place not found");
        }

        outputPlaces.push(outputPlace);
      }

      if (arc.target === transitionId) {
        const inputPlace = petriNetDefinition.nodes.find(
          (option): option is PlaceNodeType =>
            option.type === "place" && option.id === arc.source,
        );

        if (!inputPlace) {
          throw new Error("Input place not found");
        }

        inputPlaces.push(inputPlace);
      }
    }

    return {
      transitionNode: node,
      allInputPlaces: inputPlaces,
      allOutputPlaces: outputPlaces,
    };
  }, [petriNetDefinition.arcs, petriNetDefinition.nodes, transitionId]);

  const [localData, setEditedData] = useState<Omit<TransitionNodeData, "type">>(
    {
      label: transitionNode.data.label,
      description: transitionNode.data.description ?? "",
      conditions: transitionNode.data.conditions ?? [],
      delay: transitionNode.data.delay,
      childNet: transitionNode.data.childNet,
    },
  );

  const hasConditions = localData.conditions && localData.conditions.length > 0;

  const { existingNets } = useEditorContext();

  const updateChildNet = useCallback(
    ({
      childNetId,
      childNetTitle,
      inputPlaceIds,
      outputPlaceIds,
    }: {
      childNetId: string;
      childNetTitle: string;
      inputPlaceIds: string[];
      outputPlaceIds: string[];
    }) => {
      setEditedData((prev) => ({
        ...prev,
        childNet: {
          childNetId,
          childNetTitle,
          inputPlaceIds,
          outputPlaceIds,
        },
      }));
    },
    [],
  );

  const handleAddCondition = useCallback(() => {
    setEditedData((prev) => {
      const existingConditions = prev.conditions ?? [];

      if (existingConditions.length === 0) {
        const newCondition: TransitionCondition = {
          id: `condition-${Date.now()}`,
          name: "Condition 1",
          probability: 100,
          outputEdgeId: outgoingEdges[0]!.id,
        };

        return {
          ...prev,
          conditions: [newCondition],
        };
      }

      const newConditionCount = existingConditions.length + 1;
      const probabilities = distributeEvenlyWithRemainder(newConditionCount);

      const adjustedConditions = existingConditions.map((condition, index) => ({
        ...condition,
        probability: probabilities[index]!,
      }));

      const newCondition: TransitionCondition = {
        id: `condition-${generateUuid()}`,
        name: `Condition ${newConditionCount}`,
        probability: probabilities[newConditionCount - 1]!,
        outputEdgeId: outgoingEdges[0]!.id,
      };

      return {
        ...prev,
        conditions: [...adjustedConditions, newCondition],
      };
    });
  }, [outgoingEdges]);

  const handleConditionNameChange = useCallback(
    (conditionId: string, name: string) => {
      setEditedData((prev) => ({
        ...prev,
        conditions: (prev.conditions ?? []).map((condition) =>
          condition.id === conditionId ? { ...condition, name } : condition,
        ),
      }));
    },
    [],
  );

  const handleRemoveCondition = useCallback((conditionId: string) => {
    setEditedData((prev) => {
      const conditions = prev.conditions ?? [];
      const conditionToRemove = conditions.find(
        (condition) => condition.id === conditionId,
      );

      if (!conditionToRemove) {
        return prev;
      }

      const remainingConditions = conditions.filter(
        (condition) => condition.id !== conditionId,
      );
      return {
        ...prev,
        conditions: distributeRemovedProbability(
          remainingConditions,
          conditionToRemove.probability,
        ),
      };
    });
  }, []);

  const handleConditionProbabilityChange = useCallback(
    (conditionId: string, newProbability: number) => {
      setEditedData((prev) => {
        const conditions = prev.conditions ?? [];
        const updatedConditions = conditions.map((condition) =>
          condition.id === conditionId
            ? { ...condition, probability: newProbability }
            : condition,
        );
        return {
          ...prev,
          conditions: normalizeProbabilities(updatedConditions),
        };
      });
    },
    [],
  );

  const handleToggleEdgeForCondition = useCallback(
    (conditionId: string, edgeId: string) => {
      setEditedData((prev) => ({
        ...prev,
        conditions: (prev.conditions ?? []).map((condition) => {
          if (condition.id === conditionId) {
            return {
              ...condition,
              outputEdgeId: edgeId,
            };
          }
          return condition;
        }),
      }));
    },
    [],
  );

  const handleSave = useCallback(() => {
    const dataToSave = { ...localData };

    if (dataToSave.conditions && dataToSave.conditions.length > 0) {
      dataToSave.conditions = normalizeProbabilities(dataToSave.conditions);
    }

    onUpdateTransition(transitionId, dataToSave);
    onClose();
  }, [transitionId, localData, onUpdateTransition, onClose]);

  const totalProbability = useMemo(() => {
    return (localData.conditions ?? []).reduce(
      (sum, condition) => sum + condition.probability,
      0,
    );
  }, [localData.conditions]);

  const existingNetsAvailable = existingNets.length > 0;

  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth="sm"
      title="Edit Transition"
      footer={
        <>
          <Button onClick={onClose} variant="tertiary" size="small">
            Cancel
          </Button>
          <Button
            onClick={handleSave}
            variant="primary"
            disabled={hasConditions && totalProbability !== 100}
            size="small"
          >
            Save
          </Button>
        </>
      }
    >
      <div
        className={css({
          display: "flex",
          flexDirection: "column",
          gap: "spacing.6",
        })}
      >
        <div
          className={css({
            display: "flex",
            flexDirection: "column",
            gap: "spacing.2",
          })}
        >
          <span
            className={css({
              fontSize: "size.textsm",
              fontWeight: "medium",
              color: "core.gray.80",
              textTransform: "uppercase",
              letterSpacing: "[0.5px]",
            })}
          >
            Name
          </span>
          <TextField
            value={localData.label}
            onChange={(event) =>
              setEditedData((prev) => ({
                ...prev,
                label: event.target.value,
              }))
            }
            fullWidth
          />
        </div>

        <div
          className={css({
            display: "flex",
            flexDirection: "column",
            gap: "spacing.2",
          })}
        >
          <span
            className={css({
              fontSize: "size.textsm",
              fontWeight: "medium",
              color: "core.gray.80",
              textTransform: "uppercase",
              letterSpacing: "[0.5px]",
            })}
          >
            Description
          </span>
          <TextField
            value={localData.description}
            onChange={(event) =>
              setEditedData((prev) => ({
                ...prev,
                description: event.target.value,
              }))
            }
            fullWidth
          />
        </div>

        {existingNetsAvailable && (
          <div
            className={css({
              border: "1px solid",
              borderColor: "core.gray.20",
              borderRadius: "radius.8",
              padding: "spacing.4",
              display: "flex",
              flexDirection: "column",
              gap: "spacing.3",
            })}
          >
            <div
              className={css({
                display: "flex",
                flexDirection: "column",
                gap: "spacing.2",
              })}
            >
              <span
                className={css({
                  fontSize: "size.textsm",
                  fontWeight: "medium",
                  color: "core.gray.80",
                  textTransform: "uppercase",
                  letterSpacing: "[0.5px]",
                })}
              >
                Child net
              </span>
              <NetSelector
                options={existingNets}
                placeholder="Select child net to link"
                value={localData.childNet?.childNetId ?? null}
                onSelect={(value) =>
                  updateChildNet({
                    inputPlaceIds: allInputPlaces.map((place) => place.id),
                    outputPlaceIds: allOutputPlaces.map((place) => place.id),
                    ...localData.childNet,
                    childNetId: value.netId,
                    childNetTitle: value.title,
                  })
                }
              />
            </div>

            {localData.childNet && (
              <>
                <div className={css({ marginTop: "spacing.5" })}>
                  <span
                    className={css({
                      fontSize: "size.textsm",
                      fontWeight: "medium",
                      color: "core.gray.90",
                      textTransform: "uppercase",
                      letterSpacing: "[0.5px]",
                      display: "block",
                      marginBottom: "spacing.3",
                    })}
                  >
                    input places
                  </span>
                  <div
                    className={css({
                      display: "flex",
                      flexDirection: "column",
                      gap: "spacing.3",
                    })}
                  >
                    {allInputPlaces.map((place) => {
                      const isInputPlaceChecked =
                        !!localData.childNet?.inputPlaceIds.includes(place.id);
                      const onlyInputPlaceChecked =
                        localData.childNet?.inputPlaceIds.length === 1 &&
                        isInputPlaceChecked;

                      return (
                        <div
                          key={place.id}
                          title={
                            onlyInputPlaceChecked
                              ? "At least one input place must be represented in the child net."
                              : ""
                          }
                          className={css({
                            display: "flex",
                            alignItems: "center",
                            gap: "spacing.2",
                            cursor: onlyInputPlaceChecked
                              ? "not-allowed"
                              : "pointer",
                            opacity: onlyInputPlaceChecked ? 0.5 : 1,
                          })}
                        >
                          <Checkbox
                            checked={isInputPlaceChecked}
                            disabled={onlyInputPlaceChecked}
                            onChange={(checked) => {
                              const currentInputPlaceIds =
                                localData.childNet?.inputPlaceIds ?? [];
                              const newInputPlaceIds = checked
                                ? [...currentInputPlaceIds, place.id]
                                : currentInputPlaceIds.filter(
                                    (id) => id !== place.id,
                                  );

                              updateChildNet({
                                ...localData.childNet!,
                                inputPlaceIds: newInputPlaceIds,
                                outputPlaceIds:
                                  localData.childNet?.outputPlaceIds ?? [],
                                childNetId: localData.childNet!.childNetId,
                                childNetTitle:
                                  localData.childNet!.childNetTitle,
                              });
                            }}
                          />
                          <span
                            className={css({
                              fontSize: "size.textsm",
                              color: "core.gray.90",
                            })}
                          >
                            {place.data.label}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>

                <div className={css({ marginTop: "spacing.5" })}>
                  <span
                    className={css({
                      fontSize: "size.textsm",
                      fontWeight: "medium",
                      color: "core.gray.90",
                      textTransform: "uppercase",
                      letterSpacing: "[0.5px]",
                      display: "block",
                      marginBottom: "spacing.3",
                    })}
                  >
                    output places
                  </span>
                  <div
                    className={css({
                      display: "flex",
                      flexDirection: "column",
                      gap: "spacing.3",
                    })}
                  >
                    {allOutputPlaces.map((place) => {
                      const isOutputPlaceChecked =
                        !!localData.childNet?.outputPlaceIds.includes(place.id);
                      const onlyOutputPlaceChecked =
                        localData.childNet?.outputPlaceIds.length === 1 &&
                        isOutputPlaceChecked;

                      return (
                        <div
                          key={place.id}
                          title={
                            onlyOutputPlaceChecked
                              ? "At least one output place must be represented in the child net."
                              : ""
                          }
                          className={css({
                            display: "flex",
                            alignItems: "center",
                            gap: "spacing.2",
                            cursor: onlyOutputPlaceChecked
                              ? "not-allowed"
                              : "pointer",
                            opacity: onlyOutputPlaceChecked ? 0.5 : 1,
                          })}
                        >
                          <Checkbox
                            checked={isOutputPlaceChecked}
                            disabled={onlyOutputPlaceChecked}
                            onChange={(checked) => {
                              const currentOutputPlaceIds =
                                localData.childNet?.outputPlaceIds ?? [];
                              const newOutputPlaceIds = checked
                                ? [...currentOutputPlaceIds, place.id]
                                : currentOutputPlaceIds.filter(
                                    (id) => id !== place.id,
                                  );

                              updateChildNet({
                                ...localData.childNet!,
                                inputPlaceIds:
                                  localData.childNet?.inputPlaceIds ?? [],
                                outputPlaceIds: newOutputPlaceIds,
                                childNetId: localData.childNet!.childNetId,
                                childNetTitle:
                                  localData.childNet!.childNetTitle,
                              });
                            }}
                          />
                          <span
                            className={css({
                              fontSize: "size.textsm",
                              color: "core.gray.90",
                            })}
                          >
                            {place.data.label}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </>
            )}
          </div>
        )}

        {!existingNetsAvailable && (
          <div
            className={css({
              height: "[1px]",
              backgroundColor: "core.gray.20",
            })}
          />
        )}

        <div>
          <div
            className={css({
              display: "flex",
              alignItems: "center",
              gap: "spacing.3",
            })}
          >
            <Switch
              checked={hasConditions}
              onChange={(checked) => {
                setEditedData((prev) => ({
                  ...prev,
                  conditions: checked
                    ? [
                        {
                          id: `condition-${Date.now()}`,
                          name: "Default",
                          probability: 100,
                          outputEdgeId: outgoingEdges[0]!.id,
                        },
                      ]
                    : [],
                }));
              }}
            />
            <span
              className={css({
                fontSize: "size.textsm",
                color: "core.gray.90",
              })}
            >
              This transition has multiple possible outcomes
            </span>
          </div>

          {hasConditions && (
            <div className={css({ marginTop: "spacing.4" })}>
              <div
                className={css({
                  marginBottom: "spacing.4",
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                })}
              >
                <span
                  className={css({
                    fontSize: "size.textsm",
                    fontWeight: "medium",
                    color:
                      totalProbability === 100
                        ? "core.green.70"
                        : "core.red.80",
                  })}
                >
                  Total Probability: {totalProbability}%
                </span>
                <Button
                  size="xs"
                  onClick={handleAddCondition}
                  disabled={
                    localData.conditions?.length === outgoingEdges.length
                  }
                >
                  Add Condition
                </Button>
              </div>

              <div
                className={css({
                  display: "flex",
                  flexDirection: "column",
                  gap: "spacing.4",
                })}
              >
                {(localData.conditions ?? []).map((condition) => (
                  <div
                    key={condition.id}
                    className={css({
                      paddingTop: "spacing.3",
                      paddingBottom: "spacing.3",
                      paddingLeft: "spacing.4",
                      paddingRight: "spacing.4",
                      border: "1px solid",
                      borderColor: "core.gray.20",
                      borderRadius: "radius.8",
                    })}
                  >
                    <div
                      className={css({
                        display: "flex",
                        flexDirection: "column",
                        gap: "spacing.4",
                      })}
                    >
                      <div
                        className={css({
                          display: "flex",
                          justifyContent: "space-between",
                          alignItems: "flex-start",
                        })}
                      >
                        <div
                          className={css({
                            flex: "1",
                            display: "flex",
                            flexDirection: "column",
                            gap: "spacing.2",
                          })}
                        >
                          <span
                            className={css({
                              fontSize: "size.textsm",
                              fontWeight: "medium",
                              color: "core.gray.80",
                              textTransform: "uppercase",
                              letterSpacing: "[0.5px]",
                            })}
                          >
                            Condition Name
                          </span>
                          <TextField
                            value={condition.name}
                            onChange={(event) =>
                              handleConditionNameChange(
                                condition.id,
                                event.target.value,
                              )
                            }
                            fullWidth
                          />
                        </div>
                        {(localData.conditions?.length ?? 0) > 1 && (
                          <button
                            type="button"
                            onClick={() => handleRemoveCondition(condition.id)}
                            className={css({
                              padding: "spacing.2",
                              border: "none",
                              background: "[transparent]",
                              cursor: "pointer",
                              color: "core.gray.60",
                              _hover: {
                                color: "core.gray.80",
                              },
                            })}
                          >
                            ×
                          </button>
                        )}
                      </div>

                      <Slider
                        label={`Probability: ${condition.probability}%`}
                        value={condition.probability}
                        onChange={(value) =>
                          handleConditionProbabilityChange(condition.id, value)
                        }
                        min={1}
                        max={100}
                        step={1}
                      />

                      <div>
                        <span
                          className={css({
                            fontSize: "size.textsm",
                            fontWeight: "semibold",
                            color: "core.gray.80",
                            textTransform: "uppercase",
                            letterSpacing: "[0.5px]",
                            display: "block",
                            marginBottom: "spacing.2",
                          })}
                        >
                          Output to
                        </span>
                        {outgoingEdges.length === 0 ? (
                          <span
                            className={css({
                              fontSize: "size.textsm",
                              color: "core.gray.60",
                            })}
                          >
                            No output paths available. Add arcs from this
                            transition first.
                          </span>
                        ) : (
                          <Select
                            value={condition.outputEdgeId}
                            onChange={(value) =>
                              handleToggleEdgeForCondition(condition.id, value)
                            }
                            options={outgoingEdges.map((outEdge) => ({
                              value: outEdge.id,
                              label: outEdge.targetLabel,
                            }))}
                          />
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </Dialog>
  );
};
