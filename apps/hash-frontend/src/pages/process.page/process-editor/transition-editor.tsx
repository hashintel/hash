import { IconButton, TextField } from "@hashintel/design-system";
import {
  Box,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  FormControlLabel,
  Slider,
  Stack,
  Switch,
  Typography,
} from "@mui/material";
import { useCallback, useEffect, useMemo, useState } from "react";

import { Button } from "../../../shared/ui";
import type { ArcType, TokenType } from "./types";

type TransitionCondition = {
  id: string;
  name: string;
  probability: number;
  outputEdgeId: string;
};

type TransitionData = {
  label: string;
  description?: string;
  conditions?: TransitionCondition[];
};

type TransitionEditorProps = {
  open: boolean;
  onClose: () => void;
  transitionId: string;
  transitionData: TransitionData;
  tokenTypes: TokenType[];
  outgoingEdges: Array<
    ArcType & {
      targetLabel: string;
    }
  >;
  onUpdateTransition: (transitionId: string, data: TransitionData) => void;
};

export const TransitionEditor = ({
  open,
  onClose,
  transitionId,
  transitionData,
  tokenTypes,
  outgoingEdges,
  onUpdateTransition,
}: TransitionEditorProps) => {
  const [localData, setEditedData] = useState<TransitionData>({
    label: "",
    description: "",
    conditions: [],
  });

  const [hasConditions, setHasConditions] = useState(
    transitionData.conditions && transitionData.conditions.length > 0,
  );

  useEffect(() => {
    if (open) {
      setEditedData({
        label: transitionData.label,
        description: transitionData.description ?? "",
        conditions: transitionData.conditions ?? [],
      });

      if (
        !transitionData.conditions ||
        transitionData.conditions.length === 0
      ) {
        setEditedData((prev) => ({
          ...prev,
          conditions:
            outgoingEdges.length > 0
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
      }
    }
  }, [open, transitionData, outgoingEdges]);

  const handleLabelChange = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      setEditedData((prev) => ({
        ...prev,
        label: event.target.value,
      }));
    },
    [],
  );

  const handleDescriptionChange = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      setEditedData((prev) => ({
        ...prev,
        description: event.target.value,
      }));
    },
    [],
  );

  const handleProcessingTimeChange = useCallback(
    (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      const value = parseFloat(event.target.value);
      setEditedData((prev) => ({
        ...prev,
        delay: Number.isNaN(value) ? undefined : value,
      }));
    },
    [],
  );

  // New handlers for conditional logic
  const handleHasConditionsChange = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      setHasConditions(event.target.checked);
      setEditedData((prev) => ({
        ...prev,
        // If enabling conditions and none exist, create a default one
        conditions:
          hasConditions && (!prev.conditions || prev.conditions.length === 0)
            ? [
                {
                  id: `condition-${Date.now()}`,
                  name: "Default",
                  probability: 100,
                  outputEdgeId: outgoingEdges[0]!.id,
                },
              ]
            : prev.conditions,
      }));
    },
    [outgoingEdges, hasConditions],
  );

  const handleAddCondition = useCallback(() => {
    setEditedData((prev) => {
      const existingConditions = prev.conditions ?? [];

      // Quick path: if no conditions exist, create one with 100%
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

      // If we have existing conditions, distribute evenly
      const newConditionCount = existingConditions.length + 1;
      const targetProbability = Math.floor(100 / newConditionCount);
      const remainder = 100 - targetProbability * newConditionCount;

      // Create adjusted conditions with evenly distributed probabilities
      const adjustedConditions = existingConditions.map((condition, index) => {
        return {
          id: condition.id,
          name: condition.name,
          probability: targetProbability + (index === 0 ? remainder : 0),
          outputEdgeId: condition.outputEdgeId,
        };
      });

      const newCondition: TransitionCondition = {
        id: `condition-${Date.now()}`,
        name: `Condition ${newConditionCount}`,
        probability: targetProbability,
        outputEdgeId: outgoingEdges[0]!.id,
      };

      return {
        ...prev,
        conditions: [...adjustedConditions, newCondition],
      };
    });
  }, [outgoingEdges]);

  const handleRemoveCondition = useCallback((conditionId: string) => {
    setEditedData((prev) => {
      const conditions = prev.conditions ?? [];

      // Find the condition to remove and its probability
      const conditionToRemove = conditions.find(
        (condition) => condition.id === conditionId,
      );
      if (!conditionToRemove) {
        return prev;
      }

      const probabilityToRedistribute = conditionToRemove.probability;
      const remainingConditions = conditions.filter(
        (condition) => condition.id !== conditionId,
      );

      // If no conditions left, just return empty array
      if (remainingConditions.length === 0) {
        return {
          ...prev,
          conditions: [],
        };
      }

      // If only one condition left, it gets 100%
      if (remainingConditions.length === 1) {
        const condition = remainingConditions[0];
        if (!condition) {
          return prev;
        }

        const updatedCondition: TransitionCondition = {
          id: condition.id,
          name: condition.name,
          probability: 100,
          outputEdgeId: condition.outputEdgeId,
        };

        return {
          ...prev,
          conditions: [updatedCondition],
        };
      }

      // Distribute the removed probability proportionally
      const totalRemainingProbability = remainingConditions.reduce(
        (sum, condition) => sum + condition.probability,
        0,
      );

      // Calculate how much to add to each remaining condition
      const distributionFactor =
        totalRemainingProbability > 0
          ? probabilityToRedistribute / totalRemainingProbability
          : 0;

      // Distribute proportionally
      const adjustedConditions = remainingConditions.map((condition) => {
        return {
          id: condition.id,
          name: condition.name,
          probability: Math.round(
            condition.probability * (1 + distributionFactor),
          ),
          outputEdgeId: condition.outputEdgeId,
        };
      });

      // Fix any rounding errors by adjusting the first condition
      const newTotal = adjustedConditions.reduce(
        (sum, condition) => sum + condition.probability,
        0,
      );

      if (newTotal !== 100 && adjustedConditions.length > 0) {
        const firstCondition = adjustedConditions[0];
        if (firstCondition) {
          adjustedConditions[0] = {
            id: firstCondition.id,
            name: firstCondition.name,
            probability: firstCondition.probability + (100 - newTotal),
            outputEdgeId: firstCondition.outputEdgeId,
          };
        }
      }

      return {
        ...prev,
        conditions: adjustedConditions,
      };
    });
  }, []);

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

  const handleConditionProbabilityChange = useCallback(
    (conditionId: string, newProbability: number) => {
      setEditedData((prev) => {
        const conditions = prev.conditions ?? [];

        // If there's only one condition, it must be 100%
        if (conditions.length === 1) {
          const condition = conditions[0];
          if (!condition) {
            return prev;
          }

          const updatedCondition: TransitionCondition = {
            id: condition.id,
            name: condition.name,
            probability: 100,
            outputEdgeId: condition.outputEdgeId,
          };

          return {
            ...prev,
            conditions: [updatedCondition],
          };
        }

        // Find the condition being changed
        const conditionToUpdate = conditions.find(
          (condition) => condition.id === conditionId,
        );

        if (!conditionToUpdate) {
          throw new Error(
            `Condition to update with id ${conditionId} not found`,
          );
        }

        const oldProbability = conditionToUpdate.probability;

        const probabilityDelta = newProbability - oldProbability;

        // If no change, return unchanged
        if (probabilityDelta === 0) {
          return prev;
        }

        let hasDeltaBeenDistributed = false;
        const newConditions: TransitionCondition[] = [];

        for (const condition of conditions) {
          if (condition.id === conditionId) {
            newConditions.push({
              ...condition,
              probability: newProbability,
            });
            continue;
          }

          if (hasDeltaBeenDistributed) {
            newConditions.push(condition);
            continue;
          }

          newConditions.push({
            ...condition,
            probability: condition.probability - probabilityDelta,
          });
          hasDeltaBeenDistributed = true;
        }

        return {
          ...prev,
          conditions: newConditions,
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
    // Ensure conditions sum to 100% before saving
    const dataToSave = { ...localData };

    if (dataToSave.conditions && dataToSave.conditions.length > 0) {
      const totalProbability = dataToSave.conditions.reduce(
        (sum, condition) => sum + condition.probability,
        0,
      );

      if (totalProbability !== 100) {
        // Fast path: if only one condition, set to 100%
        if (dataToSave.conditions.length === 1) {
          const condition = dataToSave.conditions[0];
          if (condition) {
            dataToSave.conditions[0] = {
              id: condition.id,
              name: condition.name,
              probability: 100,
              outputEdgeId: condition.outputEdgeId,
            };
          }
        } else {
          // Normalize probabilities to sum to 100%
          const factor = 100 / totalProbability;
          dataToSave.conditions = dataToSave.conditions.map((condition) => ({
            id: condition.id,
            name: condition.name,
            probability: Math.round(condition.probability * factor),
            outputEdgeId: condition.outputEdgeId,
          }));

          // Fix any rounding errors by adjusting the first condition
          const newTotal = dataToSave.conditions.reduce(
            (sum, condition) => sum + condition.probability,
            0,
          );

          if (newTotal !== 100 && dataToSave.conditions.length > 0) {
            const firstCondition = dataToSave.conditions[0];
            if (firstCondition) {
              dataToSave.conditions[0] = {
                id: firstCondition.id,
                name: firstCondition.name,
                probability: firstCondition.probability + (100 - newTotal),
                outputEdgeId: firstCondition.outputEdgeId,
              };
            }
          }
        }
      }
    }

    onUpdateTransition(transitionId, dataToSave);
    onClose();
  }, [transitionId, localData, onUpdateTransition, onClose]);

  // Calculate total probability
  const totalProbability = useMemo(() => {
    return (localData.conditions ?? []).reduce(
      (sum, condition) => sum + condition.probability,
      0,
    );
  }, [localData.conditions]);

  return (
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
      <DialogTitle>Edit Transition</DialogTitle>
      <DialogContent>
        <Stack spacing={3} sx={{ mt: 1 }}>
          {/* Basic transition properties */}
          <TextField
            label="Transition Name"
            value={localData.label}
            onChange={handleLabelChange}
            fullWidth
          />

          <TextField
            label="Description"
            value={localData.description}
            onChange={handleDescriptionChange}
            fullWidth
            multiline
            rows={2}
          />

          {/* Processing times section */}
          <Box>
            <Typography fontWeight="bold" sx={{ mb: 1 }}>
              Processing Times
            </Typography>
            <Typography color="text.secondary" sx={{ mb: 2 }}>
              Specify how long this transition takes to process each token type
              (in hours)
            </Typography>

            <Stack spacing={2}>
              {tokenTypes.map((tokenType) => (
                <Stack
                  key={tokenType.id}
                  direction="row"
                  spacing={2}
                  alignItems="center"
                >
                  <Box
                    sx={{
                      width: 16,
                      height: 16,
                      borderRadius: "50%",
                      bgcolor: tokenType.color,
                    }}
                  />
                  <Typography sx={{ width: 150 }}>{tokenType.name}</Typography>
                  <TextField
                    label="Processing Time (hours)"
                    type="number"
                    value={localData.delay ?? 0}
                    onChange={(event) => handleProcessingTimeChange(event)}
                    inputProps={{ min: 0, step: 0.1 }}
                    sx={{ width: 200 }}
                  />
                </Stack>
              ))}
            </Stack>
          </Box>

          <Divider />

          {/* Conditional outputs section */}
          <Box>
            <Typography fontWeight="bold" sx={{ mb: 1 }}>
              Conditional Outputs
            </Typography>

            <FormControlLabel
              control={
                <Switch
                  checked={localData.hasConditions}
                  onChange={handleHasConditionsChange}
                />
              }
              label="This transition has multiple possible outcomes"
            />

            {localData.hasConditions && (
              <Box sx={{ mt: 2 }}>
                <Typography color="text.secondary" sx={{ mb: 2 }}>
                  Define different conditions that determine which outputs are
                  produced. The total probability should sum to 100%.
                </Typography>

                <Box
                  sx={{
                    mb: 2,
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                  }}
                >
                  <Typography
                    color={
                      totalProbability === 100 ? "success.main" : "error.main"
                    }
                    fontWeight="bold"
                  >
                    Total Probability: {totalProbability}%
                  </Typography>
                  <Button
                    size="small"
                    onClick={handleAddCondition}
                    disabled={
                      localData.conditions?.length === outgoingEdges.length
                    }
                  >
                    Add Condition
                  </Button>
                </Box>

                {/* Conditions list */}
                <Stack spacing={3} sx={{ mt: 2 }}>
                  {(localData.conditions ?? []).map((condition) => (
                    <Box
                      key={condition.id}
                      sx={{
                        p: 2,
                        border: "1px solid",
                        borderColor: "divider",
                        borderRadius: 1,
                        position: "relative",
                      }}
                    >
                      {/* Only show remove button if there's more than one condition */}
                      {(localData.conditions?.length ?? 0) > 1 && (
                        <IconButton
                          size="small"
                          sx={{ position: "absolute", top: 8, right: 8 }}
                          onClick={() => handleRemoveCondition(condition.id)}
                        >
                          ✕
                        </IconButton>
                      )}

                      <Stack spacing={2}>
                        <TextField
                          label="Condition Name"
                          value={condition.name}
                          onChange={(event) =>
                            handleConditionNameChange(
                              condition.id,
                              event.target.value,
                            )
                          }
                          fullWidth
                        />

                        <Box>
                          <Typography gutterBottom>
                            Probability: {condition.probability}%
                          </Typography>
                          <Slider
                            value={condition.probability}
                            onChange={(_event, value) =>
                              handleConditionProbabilityChange(
                                condition.id,
                                typeof value === "number" ? value : value[0],
                              )
                            }
                            valueLabelDisplay="auto"
                            step={1}
                            marks
                            min={1}
                            max={100}
                          />
                        </Box>

                        <Box>
                          <Typography fontWeight="bold" sx={{ mb: 1 }}>
                            Active Output Paths:
                          </Typography>
                          <Stack spacing={1}>
                            {outgoingEdges.length === 0 ? (
                              <Typography color="text.secondary">
                                No output paths available. Add connections from
                                this transition first.
                              </Typography>
                            ) : (
                              outgoingEdges.map((edge) => (
                                <FormControlLabel
                                  key={edge.id}
                                  control={
                                    <Switch
                                      checked={condition.outputEdgeIds.includes(
                                        edge.id,
                                      )}
                                      onChange={() =>
                                        handleToggleEdgeForCondition(
                                          condition.id,
                                          edge.id,
                                        )
                                      }
                                    />
                                  }
                                  label={`To: ${edge.targetLabel} (${Object.entries(
                                    edge.data?.tokenWeights ?? {},
                                  )
                                    .filter(([_, weight]) => (weight ?? 0) > 0)
                                    .map(([tokenId, weight]) => {
                                      const token = tokenTypes.find(
                                        (tokenType) => tokenType.id === tokenId,
                                      );
                                      return token
                                        ? `${weight} ${token.name}`
                                        : "";
                                    })
                                    .join(", ")})`}
                                />
                              ))
                            )}
                          </Stack>
                        </Box>
                      </Stack>
                    </Box>
                  ))}
                </Stack>
              </Box>
            )}
          </Box>
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button
          onClick={handleSave}
          variant="primary"
          disabled={hasConditions && totalProbability !== 100}
        >
          Save
        </Button>
      </DialogActions>
    </Dialog>
  );
};
