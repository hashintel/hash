import {
  IconButton,
  Select,
  TextField,
  XMarkRegularIcon,
} from "@hashintel/design-system";
import {
  Box,
  Button,
  Checkbox,
  Dialog,
  DialogActions,
  DialogContent,
  Divider,
  FormControlLabel,
  MenuItem,
  Slider,
  Stack,
  Switch,
  Tooltip,
  Typography,
} from "@mui/material";
import { useCallback, useMemo, useState } from "react";

import { useEditorContext } from "./editor-context";
import { generateUuid } from "./generate-uuid";
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

  const handleHasConditionsChange = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      setEditedData((prev) => ({
        ...prev,
        conditions: event.target.checked
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
    },
    [outgoingEdges],
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
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogContent>
        <Stack spacing={3}>
          <Box component="label">
            <Typography variant="smallCaps" sx={{ mb: 1 }}>
              Name
            </Typography>
            <TextField
              value={localData.label}
              onChange={(event) =>
                setEditedData((prev) => ({
                  ...prev,
                  label: event.target.value,
                }))
              }
              fullWidth
              size="small"
            />
          </Box>

          <Box component="label">
            <Typography variant="smallCaps" sx={{ mb: 1 }}>
              Description
            </Typography>
            <TextField
              value={localData.description}
              onChange={(event) =>
                setEditedData((prev) => ({
                  ...prev,
                  description: event.target.value,
                }))
              }
              fullWidth
              size="small"
            />
          </Box>

          {/* <Box component="label">
            <Typography component="div" variant="smallCaps" sx={{ mb: 0.5 }}>
              Delay (hours)
            </Typography>

            <TextField
              type="number"
              value={localData.delay ?? 0}
              onChange={(event) =>
                setEditedData((prev) => ({
                  ...prev,
                  delay: Number.isNaN(event.target.value)
                    ? undefined
                    : parseFloat(event.target.value),
                }))
              }
              inputProps={{ min: 0, step: 0.5 }}
              sx={{ width: 80 }}
            />
          </Box> */}

          <Stack
            gap={1}
            sx={{
              border: ({ palette }) => `1px solid ${palette.gray[20]}`,
              borderRadius: 2,
              p: 2,
              display: existingNetsAvailable ? "block" : "none",
            }}
          >
            {existingNetsAvailable && (
              <Box component="label">
                <Typography
                  component="div"
                  variant="smallCaps"
                  sx={{ mb: 0.5 }}
                >
                  Child net
                </Typography>

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
              </Box>
            )}

            {localData.childNet && (
              <>
                <Box sx={{ mt: 2.5 }}>
                  <Typography
                    component="div"
                    variant="smallCaps"
                    sx={{
                      mb: 1,
                      fontWeight: 400,
                      color: ({ palette }) => palette.common.black,
                    }}
                  >
                    input places
                  </Typography>
                  <Stack gap={1}>
                    {allInputPlaces.map((place) => {
                      const isInputPlaceChecked =
                        !!localData.childNet?.inputPlaceIds.includes(place.id);
                      const onlyInputPlaceChecked =
                        localData.childNet?.inputPlaceIds.length === 1 &&
                        isInputPlaceChecked;

                      return (
                        <Tooltip
                          placement="top"
                          key={place.id}
                          title={
                            onlyInputPlaceChecked
                              ? "At least one input place must be represented in the child net."
                              : ""
                          }
                        >
                          <FormControlLabel
                            key={place.id}
                            control={
                              <Checkbox
                                size="small"
                                checked={isInputPlaceChecked}
                                disabled={onlyInputPlaceChecked}
                                onChange={(event) => {
                                  const isChecked = event.target.checked;
                                  const currentInputPlaceIds =
                                    localData.childNet?.inputPlaceIds ?? [];
                                  const newInputPlaceIds = isChecked
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
                                sx={{ mr: 0.8 }}
                              />
                            }
                            label={place.data.label}
                            sx={{ m: 0 }}
                          />
                        </Tooltip>
                      );
                    })}
                  </Stack>
                </Box>

                <Box sx={{ mt: 2.5 }}>
                  <Typography
                    component="div"
                    variant="smallCaps"
                    sx={{
                      mb: 1,
                      fontWeight: 400,
                      color: ({ palette }) => palette.common.black,
                    }}
                  >
                    output places
                  </Typography>
                  <Stack gap={1}>
                    {allOutputPlaces.map((place) => {
                      const isOutputPlaceChecked =
                        !!localData.childNet?.outputPlaceIds.includes(place.id);
                      const onlyOutputPlaceChecked =
                        localData.childNet?.outputPlaceIds.length === 1 &&
                        isOutputPlaceChecked;

                      return (
                        <Tooltip
                          placement="top"
                          key={place.id}
                          title={
                            onlyOutputPlaceChecked
                              ? "At least one output place must be represented in the child net."
                              : ""
                          }
                        >
                          <FormControlLabel
                            control={
                              <Checkbox
                                size="small"
                                checked={isOutputPlaceChecked}
                                disabled={onlyOutputPlaceChecked}
                                onChange={(event) => {
                                  const isChecked = event.target.checked;
                                  const currentOutputPlaceIds =
                                    localData.childNet?.outputPlaceIds ?? [];
                                  const newOutputPlaceIds = isChecked
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
                                sx={{ mr: 0.8 }}
                              />
                            }
                            label={place.data.label}
                            sx={{ m: 0 }}
                          />
                        </Tooltip>
                      );
                    })}
                  </Stack>
                </Box>
              </>
            )}
          </Stack>

          <Divider sx={{ display: existingNetsAvailable ? "none" : "block" }} />

          <Box>
            <Box component="label">
              <Switch
                checked={hasConditions}
                onChange={handleHasConditionsChange}
                size="small"
                sx={{ mr: 1 }}
              />
              <Typography
                variant="smallTextLabels"
                sx={{ mb: 1, fontSize: 14 }}
              >
                This transition has multiple possible outcomes
              </Typography>
            </Box>

            {hasConditions && (
              <Box sx={{ mt: 2 }}>
                <Box
                  sx={{
                    mb: 2,
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                  }}
                >
                  <Typography
                    variant="smallTextLabels"
                    sx={{
                      fontWeight: 500,
                      color: ({ palette }) =>
                        totalProbability === 100
                          ? palette.green[70]
                          : palette.red[80],
                    }}
                  >
                    Total Probability: {totalProbability}%
                  </Typography>
                  <Button
                    size="xs"
                    onClick={handleAddCondition}
                    disabled={
                      localData.conditions?.length === outgoingEdges.length
                    }
                  >
                    Add Condition
                  </Button>
                </Box>

                <Stack spacing={2} sx={{ mt: 2 }}>
                  {(localData.conditions ?? []).map((condition) => (
                    <Box
                      key={condition.id}
                      sx={{
                        py: 1,
                        px: 2,
                        border: ({ palette }) =>
                          `1px solid ${palette.gray[20]}`,
                        borderRadius: 2,
                      }}
                    >
                      <Stack spacing={2}>
                        <Stack
                          direction="row"
                          justifyContent="space-between"
                          alignItems="flex-start"
                        >
                          <Box component="label">
                            <Typography variant="smallCaps" sx={{ mb: 1 }}>
                              Condition Name
                            </Typography>
                            <TextField
                              value={condition.name}
                              onChange={(event) =>
                                handleConditionNameChange(
                                  condition.id,
                                  event.target.value,
                                )
                              }
                              fullWidth
                              size="small"
                            />
                          </Box>
                          {(localData.conditions?.length ?? 0) > 1 && (
                            <IconButton
                              onClick={() =>
                                handleRemoveCondition(condition.id)
                              }
                            >
                              <XMarkRegularIcon />
                            </IconButton>
                          )}
                        </Stack>

                        <Box>
                          <Typography variant="smallCaps">
                            Probability: {condition.probability}%
                          </Typography>
                          <Slider
                            value={condition.probability}
                            onChange={(_event, value) =>
                              handleConditionProbabilityChange(
                                condition.id,
                                typeof value === "number" ? value : value[0]!,
                              )
                            }
                            valueLabelDisplay="auto"
                            step={1}
                            min={1}
                            max={100}
                          />
                        </Box>
                      </Stack>

                      <Box>
                        <Typography
                          variant="smallCaps"
                          sx={{ fontWeight: 600 }}
                        >
                          Output to
                        </Typography>
                        <Stack spacing={1} mt={0.5}>
                          {outgoingEdges.length === 0 ? (
                            <Typography color="text.secondary">
                              No output paths available. Add arcs from this
                              transition first.
                            </Typography>
                          ) : (
                            <Box component="label">
                              <Select
                                value={condition.outputEdgeId}
                                onChange={(event) =>
                                  handleToggleEdgeForCondition(
                                    condition.id,
                                    event.target.value,
                                  )
                                }
                                size="small"
                                fullWidth
                              >
                                {outgoingEdges.map((outEdge) => (
                                  <MenuItem key={outEdge.id} value={outEdge.id}>
                                    {outEdge.targetLabel}
                                  </MenuItem>
                                ))}
                              </Select>
                            </Box>
                          )}
                        </Stack>
                      </Box>
                    </Box>
                  ))}
                </Stack>
              </Box>
            )}
          </Box>
        </Stack>
      </DialogContent>
      <DialogActions sx={{ mt: 1 }}>
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
      </DialogActions>
    </Dialog>
  );
};
