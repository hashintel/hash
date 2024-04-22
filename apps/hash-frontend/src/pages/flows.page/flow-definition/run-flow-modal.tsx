import { IconButton, TextField } from "@hashintel/design-system";
import {
  FlowDefinition,
  FlowTrigger,
  OutputDefinition,
  PayloadKind,
} from "@local/hash-isomorphic-utils/flows/types";
import { EntityTypeWithMetadata, OwnedById } from "@local/hash-subgraph";
import { Box, Stack, Switch, Typography } from "@mui/material";
import { PropsWithChildren, useState } from "react";

import { XMarkRegularIcon } from "../../../shared/icons/x-mark-regular-icon";
import { Button } from "../../../shared/ui/button";
import { Modal } from "../../../shared/ui/modal";
import { EntityTypeSelector } from "../../shared/entity-type-selector";
import { WebSelector } from "./run-flow-modal/web-selector";
import { typedValues } from "@local/advanced-types/typed-entries";

type RunFlowModalProps = {
  flowDefinition: FlowDefinition;
  open: boolean;
  onClose: () => void;
  runFlow: (outputs: FlowTrigger["outputs"]) => void;
};

type LocalInputValue =
  | string
  | number
  | boolean
  | EntityTypeWithMetadata
  | OwnedById;

type LocalInputValues = {
  Text: string;
  Number: number;
  Boolean: boolean;
  VersionedUrl: EntityTypeWithMetadata;
  WebId: OwnedById;
};

type LocalPayloadKind = keyof LocalInputValues;

type LocalPayload = {
  kind: LocalPayloadKind;
  value: LocalInputValue | LocalInputValue[];
};

type FormState = {
  [outputName: string]: {
    outputName: string;
    payload: LocalPayload;
  };
};

const ManualTriggerInput = ({
  outputDefinition,
  value,
  setValue,
}: {
  outputDefinition: OutputDefinition;
  value?: LocalInputValue | LocalInputValue[];
  setValue: (value: LocalInputValue | LocalInputValue[]) => void;
}) => {
  switch (outputDefinition.payloadKind) {
    case "Text":
      if (outputDefinition.array) {
        throw new Error("Selecting multiple texts is not supported");
      }
      return (
        <TextField
          onChange={(event) => setValue(event.target.value)}
          value={value}
        />
      );
    case "Number":
      return (
        <TextField
          onChange={(event) => setValue(event.target.value)}
          type="number"
          value={value}
        />
      );
    case "Boolean":
      return (
        <Switch
          size="small"
          checked={!!value}
          onChange={(event) => setValue(event.target.checked)}
        />
      );
    case "VersionedUrl": {
      return (
        <EntityTypeSelector
          autoFocus={false}
          disableCreate
          multiple={outputDefinition.array}
          onSelect={(newValue) =>
            setValue(Array.isArray(newValue) ? newValue : newValue)
          }
        />
      );
    }
    case "WebId": {
      if (outputDefinition.array) {
        throw new Error("Selecting multiple webs is not supported");
      }
      return (
        <WebSelector
          selectedWebOwnedById={value as OwnedById | undefined}
          setSelectedWebOwnedById={(newValue) => setValue(newValue)}
        />
      );
    }
  }

  throw new Error(
    `Unhandled trigger input type: ${outputDefinition.array ? "array of " : ""}${outputDefinition.payloadKind}`,
  );
};

const Label = ({
  children,
  required,
  text,
}: PropsWithChildren<{ required: boolean; text: string }>) => (
  <Typography
    component="label"
    variant="smallTextLabels"
    sx={{
      color: ({ palette }) => palette.gray[70],
      fontWeight: 500,
      lineHeight: 1.5,
    }}
  >
    {text}
    {children}
  </Typography>
);

export const RunFlowModal = ({
  flowDefinition,
  open,
  onClose,
  runFlow,
}: RunFlowModalProps) => {
  const { outputs } = flowDefinition.trigger;

  const [formState, setFormState] = useState<FormState>({});

  const submitValues = () => {
    if (!allRequiredValuesPresent) {
      return;
    }

    const outputValues: FlowTrigger["outputs"] = typedValues(formState).map(
      ({ outputName, payload }) => ({
        outputName,
        payload:
          payload.kind === "VersionedUrl"
            ? {
                kind: payload.kind,
                value: Array.isArray(payload.value)
                  ? payload.value.map(
                      (entityType) =>
                        (entityType as EntityTypeWithMetadata).schema.$id,
                    )
                  : (payload.value as EntityTypeWithMetadata).schema.$id,
              }
            : payload,
      }),
    );

    runFlow(outputValues);
  };

  const allRequiredValuesPresent = (outputs ?? []).every(
    (output) => !output.required || formState[output.name]?.payload.value,
  );

  return (
    <Modal contentStyle={{ p: { xs: 0, md: 0 } }} open={open} onClose={onClose}>
      <>
        <Stack
          alignItems="center"
          direction="row"
          justifyContent="space-between"
          sx={{
            borderBottom: ({ palette }) => `1px solid ${palette.gray[20]}`,
            py: 1,
            pl: 2.5,
            pr: 1.5,
          }}
        >
          <Typography
            sx={{ fontWeight: 500, color: ({ palette }) => palette.gray[80] }}
          >
            Run flow
          </Typography>
          <IconButton onClick={onClose} sx={{ "& svg": { fontSize: 20 } }}>
            <XMarkRegularIcon />
          </IconButton>
        </Stack>
        <Box sx={{ px: 4.5, py: 2.5 }}>
          <Typography
            component="p"
            variant="smallTextLabels"
            sx={{
              color: ({ palette }) => palette.gray[70],
              fontWeight: 500,
              lineHeight: 1.5,
            }}
          >
            In order to run the <strong>{flowDefinition.name}</strong> flow,
            you'll need to provide a bit more information first.
          </Typography>
          {(outputs ?? []).map((outputDef) => {
            switch (outputDef.payloadKind) {
              case "Entity":
              case "EntityType":
              case "PersistedEntities":
              case "PersistedEntity":
              case "ProposedEntity":
              case "ProposedEntityWithResolvedLinks":
              case "WebPage": {
                throw new Error("Unsupported input kind");
              }
            }

            return (
              <ManualTriggerInput
                key={outputDef.name}
                outputDefinition={outputDef}
                value={formState[outputDef.name]?.payload.value}
                setValue={(newValue) =>
                  setFormState((currentValue) => ({
                    ...currentValue,
                    [outputDef.name]: {
                      outputName: outputDef.name,
                      payload: {
                        kind: outputDef.payloadKind,
                        value: newValue,
                      },
                    },
                  }))
                }
              />
            );
          })}
          <Button
            disabled={allRequiredValuesPresent}
            size="small"
            onClick={submitValues}
            sx={{ mt: 2 }}
          >
            Run flow
          </Button>
        </Box>
      </>
    </Modal>
  );
};
