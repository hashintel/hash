import { useMutation } from "@apollo/client";
import { Box, FormControlLabel, Switch, Typography } from "@mui/material";
import { format } from "date-fns";
import { useState } from "react";

import { Callout, Select, TextField } from "@hashintel/design-system";
import { typedValues } from "@local/advanced-types/typed-entries";
import { getFlowType } from "@local/hash-isomorphic-utils/flows/get-flow-type";

import { createFlowScheduleMutation } from "../../../../../graphql/queries/knowledge/flow.queries";
import { Button } from "../../../../../shared/ui/button";
import { MenuItem } from "../../../../../shared/ui/menu-item";
import { Modal } from "../../../../../shared/ui/modal";
import { useAuthenticatedUser } from "../../../../shared/auth-info-context";
import {
  GoogleAuthProvider,
  useIsGoogleAuthAvailable,
} from "../../../../shared/integrations/google/google-auth-context";
import { WebSelector } from "../../../../shared/web-selector";
import { FlowInputField } from "./run-flow-modal/flow-input-field";
import { inputHeight } from "./run-flow-modal/shared/dimensions";
import { isSupportedPayloadKind } from "./run-flow-modal/types";

import type {
  CreateFlowScheduleMutation,
  CreateFlowScheduleMutationVariables,
} from "../../../../../graphql/api-types.gen";
import type { FormState, LocalPayload } from "./run-flow-modal/types";
import type { EntityUuid, WebId } from "@blockprotocol/type-system";
import type { CreateFlowScheduleInput } from "@local/hash-isomorphic-utils/flows/schedule-types";
import type {
  FlowActionDefinitionId,
  FlowDefinition,
  FlowInputDefinition,
  FlowInputValues,
  Payload,
  PayloadKind,
} from "@local/hash-isomorphic-utils/flows/types";
import type { PropsWithChildren } from "react";

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

const generateInitialFormState = (inputDefinitions: FlowInputDefinition[]) =>
  inputDefinitions.reduce<FormState>((acc, inputDefinition) => {
    if (isSupportedPayloadKind(inputDefinition.payloadKind)) {
      let defaultValue: LocalPayload["value"] = "";

      if (inputDefinition.array) {
        defaultValue = [];
      } else if (inputDefinition.payloadKind === "Boolean") {
        defaultValue = false;
      } else if (inputDefinition.payloadKind === "Date") {
        defaultValue = format(new Date(), "yyyy-MM-dd");
      }

      acc[inputDefinition.name] = {
        inputName: inputDefinition.name,
        payload: {
          kind: inputDefinition.payloadKind satisfies LocalPayload["kind"],
          value: defaultValue satisfies LocalPayload["value"],
        } as LocalPayload,
      };
    }
    return acc;
  }, {});

const googlePayloadKinds: PayloadKind[] = ["GoogleAccountId", "GoogleSheet"];

const isPayloadValueMissing = (payload: LocalPayload | undefined) => {
  if (payload?.value === undefined || payload.value === "") {
    return true;
  }

  if (
    payload.kind === "GoogleSheet" &&
    !Array.isArray(payload.value) &&
    "newSheetName" in payload.value
  ) {
    return payload.value.newSheetName === "";
  }

  return false;
};

const GoogleAuthProviderIfRequired = ({
  children,
  required,
}: PropsWithChildren<{ required: boolean }>) =>
  required ? <GoogleAuthProvider>{children}</GoogleAuthProvider> : children;

type IntervalUnit = "minutes" | "hours" | "days";

const intervalUnitToMs: Record<IntervalUnit, number> = {
  minutes: 60 * 1000,
  hours: 60 * 60 * 1000,
  days: 24 * 60 * 60 * 1000,
};

type RunFlowModalProps = {
  flowDefinition: FlowDefinition<FlowActionDefinitionId>;
  flowDefinitionId: EntityUuid;
  onClose: () => void;
  open: boolean;
  runFlow: (flowInputs: FlowInputValues, webId: WebId) => Promise<void>;
  onScheduleCreated: (scheduleId: EntityUuid) => void;
};

export const RunFlowModal = ({
  flowDefinition,
  flowDefinitionId,
  open,
  onClose,
  runFlow,
  onScheduleCreated,
}: RunFlowModalProps) => {
  const { inputs } = flowDefinition;

  const { authenticatedUser } = useAuthenticatedUser();

  const [webId, setWebId] = useState<WebId>(
    authenticatedUser.accountId as WebId,
  );

  const [formState, setFormState] = useState<FormState>(() =>
    generateInitialFormState(inputs),
  );

  const googleInputs = inputs.filter((input) =>
    googlePayloadKinds.includes(input.payloadKind),
  );
  const hasGoogleInputs = googleInputs.length > 0;

  const isGoogleAuthAvailable = useIsGoogleAuthAvailable();
  const hideGoogleInputs = hasGoogleInputs && !isGoogleAuthAvailable;
  const isMissingGoogleAuth =
    hideGoogleInputs && googleInputs.some((input) => input.required);

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

  const allRequiredValuesPresent = inputs.every(
    (input) =>
      !input.required || !isPayloadValueMissing(formState[input.name]?.payload),
  );

  const buildFlowInputs = (): FlowInputValues => {
    const flowInputs: FlowInputValues = {};
    for (const { inputName, payload } of typedValues(formState)) {
      if (hideGoogleInputs && googlePayloadKinds.includes(payload.kind)) {
        continue;
      }

      if (typeof payload.value !== "undefined") {
        if (Array.isArray(payload.value) && payload.value.length === 0) {
          continue;
        }

        if (payload.kind === "VersionedUrl") {
          flowInputs[inputName] = {
            kind: payload.kind,
            value: Array.isArray(payload.value)
              ? payload.value.map((entityType) => entityType.schema.$id)
              : payload.value.schema.$id,
          };
        } else {
          const assertedPayload = {
            kind: payload.kind satisfies LocalPayload["kind"],
            value: payload.value satisfies LocalPayload["value"],
          } as Payload; // this is necessary because TS isn't inferring that payload.value is not undefined

          flowInputs[inputName] = assertedPayload;
        }
      }
    }
    return flowInputs;
  };

  const submitValues = async () => {
    if (!allRequiredValuesPresent) {
      return;
    }

    const flowInputs = buildFlowInputs();

    setPending(true);

    try {
      if (isScheduleMode) {
        const intervalMs = intervalValue * intervalUnitToMs[intervalUnit];

        const scheduleInput: CreateFlowScheduleInput = {
          name: scheduleName || `${flowDefinition.name} schedule`,
          flowDefinition,
          flowDefinitionId,
          webId,
          scheduleSpec: {
            type: "interval",
            intervalMs,
          },
          flowInputs,
          triggerImmediately,
          dataSources:
            getFlowType(flowDefinition) === "ai"
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
        await runFlow(flowInputs, webId);
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
      <GoogleAuthProviderIfRequired required={hasGoogleInputs}>
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

          {isMissingGoogleAuth && (
            <Callout type="warning" sx={{ mb: 2.5 }}>
              This flow needs Google Sheets, which isn't set up on this
              instance, so it can't be run.
            </Callout>
          )}

          {inputs.map((inputDefinition) => {
            if (!isSupportedPayloadKind(inputDefinition.payloadKind)) {
              throw new Error("Unsupported input kind");
            }

            if (
              hideGoogleInputs &&
              googlePayloadKinds.includes(inputDefinition.payloadKind)
            ) {
              return null;
            }

            const payload = formState[inputDefinition.name]?.payload;

            if (!payload) {
              throw new Error("Missing form state for output");
            }

            return (
              <InputWrapper
                key={inputDefinition.name}
                label={inputDefinition.label ?? inputDefinition.name}
                required={inputDefinition.required}
              >
                <FlowInputField
                  array={inputDefinition.array}
                  formState={formState}
                  key={inputDefinition.name}
                  payload={payload}
                  required={!!inputDefinition.required}
                  setValue={(newValue) =>
                    setFormState((currentFormState) => ({
                      ...currentFormState,
                      [inputDefinition.name]: {
                        inputName: inputDefinition.name,
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
            disabled={
              isMissingGoogleAuth ||
              !allRequiredValuesPresent ||
              !scheduleValid ||
              pending
            }
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
      </GoogleAuthProviderIfRequired>
    </Modal>
  );
};
