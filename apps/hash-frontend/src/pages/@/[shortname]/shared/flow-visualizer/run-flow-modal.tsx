import { useMutation } from "@apollo/client";
import type { EntityUuid, WebId } from "@blockprotocol/type-system";
import { Select, TextField } from "@hashintel/design-system";
import { typedValues } from "@local/advanced-types/typed-entries";
import type { CreateFlowScheduleInput } from "@local/hash-isomorphic-utils/flows/schedule-types";
import type {
  FlowActionDefinitionId,
  FlowDefinition,
  FlowTrigger,
  OutputDefinition,
  StepOutput,
} from "@local/hash-isomorphic-utils/flows/types";
import { Box, FormControlLabel, Switch, Typography } from "@mui/material";
import { format } from "date-fns";
import type { PropsWithChildren } from "react";
import { useState } from "react";

import type {
  CreateFlowScheduleMutation,
  CreateFlowScheduleMutationVariables,
} from "../../../../../graphql/api-types.gen";
import { createFlowScheduleMutation } from "../../../../../graphql/queries/knowledge/flow.queries";
import { Button } from "../../../../../shared/ui/button";
import { MenuItem } from "../../../../../shared/ui/menu-item";
import { Modal } from "../../../../../shared/ui/modal";
import { useAuthenticatedUser } from "../../../../shared/auth-info-context";
import { GoogleAuthProvider } from "../../../../shared/integrations/google/google-auth-context";
import { WebSelector } from "../../../../shared/web-selector";
import { ManualTriggerInput } from "./run-flow-modal/manual-trigger-input";
import { inputHeight } from "./run-flow-modal/shared/dimensions";
import type { FormState, LocalPayload } from "./run-flow-modal/types";
import { isSupportedPayloadKind } from "./run-flow-modal/types";

const InputWrapper = ({
  children,
  required,
  label,
}: PropsWithChildren<{ required: boolean; label: string }>) => (
  <Box mb={2.5}>
    <Typography
      component="label"
      variant="smallTextLabels"
      sx={{
        color: ({ palette }) => palette.gray[70],
        fontWeight: 500,
        lineHeight: 1.5,
      }}
    >
      {label}
      {required ? "*" : ""}
      <Box>{children}</Box>
    </Typography>
  </Box>
);

const generateInitialFormState = (outputDefinitions: OutputDefinition[]) =>
  outputDefinitions.reduce<FormState>((acc, outputDefinition) => {
    if (isSupportedPayloadKind(outputDefinition.payloadKind)) {
      let defaultValue: LocalPayload["value"] = "";

      if (outputDefinition.array) {
        defaultValue = [];
      } else if (outputDefinition.payloadKind === "Boolean") {
        defaultValue = false;
      } else if (outputDefinition.payloadKind === "Date") {
        defaultValue = format(new Date(), "yyyy-MM-dd");
      }

      acc[outputDefinition.name] = {
        outputName: outputDefinition.name,
        payload: {
          kind: outputDefinition.payloadKind satisfies LocalPayload["kind"],
          value: defaultValue satisfies LocalPayload["value"],
        } as LocalPayload,
      };
    }
    return acc;
  }, {});

type IntervalUnit = "minutes" | "hours" | "days";

const intervalUnitToMs: Record<IntervalUnit, number> = {
  minutes: 60 * 1000,
  hours: 60 * 60 * 1000,
  days: 24 * 60 * 60 * 1000,
};

type RunFlowModalProps = {
  flowDefinition: FlowDefinition<FlowActionDefinitionId>;
  onClose: () => void;
  open: boolean;
  runFlow: (outputs: FlowTrigger["outputs"], webId: WebId) => Promise<void>;
  onScheduleCreated: (scheduleId: EntityUuid) => void;
};

export const RunFlowModal = ({
  flowDefinition,
  open,
  onClose,
  runFlow,
  onScheduleCreated,
}: RunFlowModalProps) => {
  const { outputs } = flowDefinition.trigger;

  const { authenticatedUser } = useAuthenticatedUser();

  const [webId, setWebId] = useState<WebId>(
    authenticatedUser.accountId as WebId,
  );

  const [formState, setFormState] = useState<FormState>(() =>
    generateInitialFormState(outputs ?? []),
  );

  const [pending, setPending] = useState(false);

  const [isScheduleMode, setIsScheduleMode] = useState(false);
  const [scheduleName, setScheduleName] = useState("");
  const [intervalValue, setIntervalValue] = useState(10);
  const [intervalUnit, setIntervalUnit] = useState<IntervalUnit>("minutes");
  const [triggerImmediately, setTriggerImmediately] = useState(true);

  const [createSchedule] = useMutation<
    CreateFlowScheduleMutation,
    CreateFlowScheduleMutationVariables
  >(createFlowScheduleMutation);

  const allRequiredValuesPresent = (outputs ?? []).every((output) => {
    const stateValue = formState[output.name]?.payload.value;
    return (
      !output.required ||
      (output.payloadKind === "Text"
        ? stateValue !== ""
        : stateValue !== undefined)
    );
  });

  const buildOutputValues = (): FlowTrigger["outputs"] => {
    const outputValues: FlowTrigger["outputs"] = [];
    for (const { outputName, payload } of typedValues(formState)) {
      if (typeof payload.value !== "undefined") {
        if (Array.isArray(payload.value) && payload.value.length === 0) {
          continue;
        }

        if (payload.kind === "VersionedUrl") {
          outputValues.push({
            outputName,
            payload: {
              kind: payload.kind,
              value: Array.isArray(payload.value)
                ? payload.value.map((entityType) => entityType.schema.$id)
                : payload.value.schema.$id,
            },
          });
        } else {
          const assertedPayload = {
            kind: payload.kind satisfies LocalPayload["kind"],
            value: payload.value satisfies LocalPayload["value"],
          } as StepOutput["payload"]; // this is necessary because TS isn't inferring that payload.value is not undefined

          outputValues.push({
            outputName,
            payload: assertedPayload,
          });
        }
      }
    }
    return outputValues;
  };

  const submitValues = async () => {
    if (!allRequiredValuesPresent) {
      return;
    }

    const outputValues = buildOutputValues();

    setPending(true);

    try {
      if (isScheduleMode) {
        const intervalMs = intervalValue * intervalUnitToMs[intervalUnit];

        const scheduleInput: CreateFlowScheduleInput = {
          name: scheduleName || `${flowDefinition.name} schedule`,
          flowDefinition,
          webId,
          scheduleSpec: {
            type: "interval",
            intervalMs,
          },
          flowTrigger: {
            outputs: outputValues,
            triggerDefinitionId: "scheduledTrigger",
          },
          triggerImmediately,
          dataSources:
            flowDefinition.type === "ai"
              ? {
                  files: { fileEntityIds: [] },
                  internetAccess: {
                    browserPlugin: { domains: [], enabled: false },
                    enabled: true,
                  },
                }
              : undefined,
        };

        const result = await createSchedule({
          variables: {
            input: scheduleInput,
          },
        });

        const scheduleId = result.data?.createFlowSchedule;
        if (scheduleId) {
          onScheduleCreated(scheduleId);
        }

        onClose();
      } else {
        await runFlow(outputValues, webId);
      }
    } finally {
      setPending(false);
    }
  };

  const scheduleValid =
    !isScheduleMode || (intervalValue > 0 && scheduleName.trim().length > 0);

  return (
    <Modal
      contentStyle={{ p: { xs: 0, md: 0 } }}
      header={{ title: isScheduleMode ? "Schedule flow" : "Run flow" }}
      open={open}
      onClose={onClose}
      sx={{ zIndex: 1000 }} // Google File Picker has zIndex 1001, MUI Modal default is 1300
    >
      <GoogleAuthProvider>
        <Box sx={{ px: 4.5, py: 2.5 }}>
          <Typography
            component="p"
            variant="smallTextLabels"
            sx={{
              color: ({ palette }) => palette.gray[70],
              fontWeight: 500,
              lineHeight: 1.5,
              mb: 2.5,
            }}
          >
            {`In order to ${isScheduleMode ? "schedule" : "run"} the ${flowDefinition.name} flow, you'll need to provide a bit more information first.`}
          </Typography>

          <FormControlLabel
            control={
              <Switch
                checked={isScheduleMode}
                onChange={(event) => setIsScheduleMode(event.target.checked)}
                size="small"
              />
            }
            label={
              <Typography
                variant="smallTextLabels"
                sx={{
                  fontWeight: 500,
                  ml: 1.5,
                  color: ({ palette }) =>
                    isScheduleMode ? palette.gray[70] : palette.gray[50],
                }}
              >
                Recurring
              </Typography>
            }
            sx={{ mb: 2.5, ml: 0 }}
          />

          {isScheduleMode && (
            <>
              <InputWrapper label="Schedule name" required>
                <TextField
                  fullWidth
                  size="small"
                  value={scheduleName}
                  onChange={(event) => setScheduleName(event.target.value)}
                  placeholder={`${flowDefinition.name} schedule`}
                  sx={{ mt: 0.5 }}
                />
              </InputWrapper>

              <InputWrapper label="Run every" required>
                <Box sx={{ display: "flex", gap: 1, mt: 0.5 }}>
                  <TextField
                    type="number"
                    size="small"
                    value={intervalValue}
                    onChange={(event) =>
                      setIntervalValue(
                        Math.max(1, parseInt(event.target.value, 10) || 1),
                      )
                    }
                    inputProps={{ min: 1 }}
                    sx={{ width: 100 }}
                  />
                  <Select
                    size="small"
                    value={intervalUnit}
                    onChange={(event) =>
                      setIntervalUnit(event.target.value as IntervalUnit)
                    }
                    sx={{ minWidth: 120 }}
                  >
                    <MenuItem value="minutes">minutes</MenuItem>
                    <MenuItem value="hours">hours</MenuItem>
                    <MenuItem value="days">days</MenuItem>
                  </Select>
                </Box>
              </InputWrapper>

              <FormControlLabel
                control={
                  <Switch
                    checked={triggerImmediately}
                    onChange={(event) =>
                      setTriggerImmediately(event.target.checked)
                    }
                    size="small"
                  />
                }
                label={
                  <Typography
                    variant="smallTextLabels"
                    sx={{
                      fontWeight: 500,
                      ml: 1.5,
                      color: ({ palette }) =>
                        triggerImmediately
                          ? palette.gray[70]
                          : palette.gray[50],
                    }}
                  >
                    Trigger first run immediately
                  </Typography>
                }
                sx={{ mb: 2.5, ml: 0 }}
              />
            </>
          )}

          {(outputs ?? []).map((outputDef) => {
            if (!isSupportedPayloadKind(outputDef.payloadKind)) {
              throw new Error("Unsupported input kind");
            }

            const payload = formState[outputDef.name]?.payload;

            if (!payload) {
              throw new Error("Missing form state for output");
            }

            return (
              <InputWrapper
                key={outputDef.name}
                label={outputDef.name}
                required={outputDef.required}
              >
                <ManualTriggerInput
                  array={outputDef.array}
                  formState={formState}
                  key={outputDef.name}
                  payload={payload}
                  required={!!outputDef.required}
                  setValue={(newValue) =>
                    setFormState((currentFormState) => ({
                      ...currentFormState,
                      [outputDef.name]: {
                        outputName: outputDef.name,
                        payload: {
                          kind: payload.kind satisfies LocalPayload["kind"],
                          value: newValue satisfies LocalPayload["value"],
                        } as LocalPayload,
                      },
                    }))
                  }
                />
              </InputWrapper>
            );
          })}
          <WebSelector
            inputHeight={inputHeight}
            selectedWebId={webId}
            setSelectedWebId={(newWebId) => setWebId(newWebId)}
          />
          <Button
            disabled={!allRequiredValuesPresent || !scheduleValid || pending}
            size="small"
            onClick={submitValues}
            sx={{ mt: 2.5 }}
          >
            {pending
              ? isScheduleMode
                ? "Creating schedule..."
                : "Starting..."
              : isScheduleMode
                ? "Create schedule"
                : "Run flow"}
          </Button>
        </Box>
      </GoogleAuthProvider>
    </Modal>
  );
};
