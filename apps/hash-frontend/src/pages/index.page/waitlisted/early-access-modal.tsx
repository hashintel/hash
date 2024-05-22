import type { TextFieldProps } from "@hashintel/design-system";
import { TextField } from "@hashintel/design-system";
import { typedEntries, typedKeys } from "@local/advanced-types/typed-entries";
import type { ProspectiveUserProperties } from "@local/hash-isomorphic-utils/system-types/prospectiveuser";
import { Box, Stack, Typography } from "@mui/material";
import type { FormEvent } from "react";
import { useState } from "react";

import { Button } from "../../../shared/ui/button";
import { Modal } from "../../../shared/ui/modal";
import { useAuthenticatedUser } from "../../shared/auth-info-context";

type FormFieldMetadata = {
  label: string;
  multiline?: boolean;
  placeholder: string;
  type?: string;
};

type FormFields = Record<keyof ProspectiveUserProperties, FormFieldMetadata>;

const formFields: FormFields = {
  "https://hash.ai/@hash/types/property-type/website-url/": {
    label: "Your company website",
    placeholder: "e.g. starbucks.com",
    type: "url",
  },
  "https://hash.ai/@hash/types/property-type/role/": {
    label: "Your role/title",
    placeholder: "e.g. CEO",
  },
  "https://hash.ai/@hash/types/property-type/email/": {
    label: "Your work email address",
    placeholder: "e.g. howard@starbucks.com",
    type: "email",
  },
  "https://hash.ai/@hash/types/property-type/intended-use/": {
    label: "What do you plan on using HASH for?",
    placeholder:
      "Provide as much detail as possible to increase your likelihood of being invited as an earlier user of HASH.",
    multiline: true,
  },
  "https://hash.ai/@hash/types/property-type/current-approach/": {
    label: "How do you currently do your work?",
    placeholder:
      "Let us know how you currently complete the above described workflow, what tools you use, etc.",
    multiline: true,
  },
  "https://hash.ai/@hash/types/property-type/willing-to-pay/": {
    label: "How much are you willing to pay for a fully automated solution?",
    placeholder: "",
  },
};

const Input = ({
  label,
  multiline,
  onChange,
  placeholder,
  type,
  value,
}: Pick<TextFieldProps, "onChange" | "value"> & FormFieldMetadata) => (
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
      <Box
        component="span"
        sx={{ color: ({ palette }) => palette.blue[70], ml: 0.5 }}
      >
        *
      </Box>
      <Box>
        <TextField
          multiline={multiline}
          onChange={onChange}
          placeholder={placeholder}
          sx={{ width: multiline ? "100%" : 330 }}
          type={type ?? "text"}
          value={value}
        />
      </Box>
    </Typography>
  </Box>
);

type EarlyAccessFormModalProps = {
  open: boolean;
  onClose: () => void;
  onSubmit: (properties: ProspectiveUserProperties) => Promise<void>;
};

export const EarlyAccessFormModal = ({
  open,
  onClose,
  onSubmit,
}: EarlyAccessFormModalProps) => {
  const { authenticatedUser } = useAuthenticatedUser();

  const [formState, setFormState] = useState<Record<keyof FormFields, string>>(
    () =>
      typedKeys(formFields).reduce(
        (acc, key) => {
          if (key === "https://hash.ai/@hash/types/property-type/email/") {
            acc[key] = authenticatedUser.emails[0]!.address;
          } else {
            acc[key] = "";
          }
          return acc;
        },
        {} as Record<keyof FormFields, string>,
      ),
  );

  const [pending, setPending] = useState(false);

  const submitValues = async (event: FormEvent) => {
    event.preventDefault();

    setPending(true);

    await onSubmit(formState);
  };

  const allValuesPresent = Object.values(formState).every(
    (value) => value.trim().length > 0,
  );

  return (
    <Modal
      contentStyle={{ p: { xs: 0, md: 0 } }}
      header={{ title: "Get early access to HASH" }}
      open={open}
      onClose={onClose}
    >
      <Box component="form" sx={{ px: 4.5, py: 3 }} onSubmit={submitValues}>
        {typedEntries(formFields).map(([key, metadata]) => {
          return (
            <Input
              key={key}
              {...metadata}
              onChange={(event) =>
                setFormState((currentState) => ({
                  ...currentState,
                  [key]: event.target.value,
                }))
              }
            />
          );
        })}
        <Stack direction="row" mt={3} mb={2}>
          <Button
            disabled={!allValuesPresent || pending}
            size="small"
            type="submit"
          >
            {pending ? "Submitting..." : "Submit answers"}
          </Button>
          <Button
            size="small"
            onClick={onClose}
            sx={{ ml: 1.5 }}
            type="button"
            variant="tertiary"
          >
            Discard
          </Button>
        </Stack>
      </Box>
    </Modal>
  );
};
