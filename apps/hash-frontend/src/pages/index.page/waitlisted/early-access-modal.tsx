import type { FormEvent, useState } from "react";
import { Select, TextField } from "@hashintel/design-system";
import { typedEntries, typedKeys } from "@local/advanced-types/typed-entries";
import type { ProspectiveUserProperties } from "@local/hash-isomorphic-utils/system-types/prospectiveuser";
import { Box, Stack, Typography } from "@mui/material";

import { Button } from "../../../shared/ui/button";
import { MenuItem } from "../../../shared/ui/menu-item";
import { Modal } from "../../../shared/ui/modal";
import { useAuthenticatedUser } from "../../shared/auth-info-context";

interface FormFieldMetadata {
  label: string;
  multiline?: boolean;
  options?: string[];
  placeholder: string;
  type?: string;
  url?: boolean;
}

type FormFields = Record<keyof ProspectiveUserProperties, FormFieldMetadata>;

const formFields: FormFields = {
  "https://hash.ai/@hash/types/property-type/website-url/": {
    label: "Your company website",
    placeholder: "e.g. starbucks.com",
    url: true,
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
    options: [
      "$1—$20 per month",
      "$21-$50 per month",
      "$51-$250 per month",
      "$250+ per month",
      "On an 'as needed' basis",
      "I'm not willing to pay",
    ],
  },
};

const Input = ({
  label,
  multiline,
  onChange,
  options,
  placeholder,
  type,
  url,
  value,
}: {
  onChange: (value: string) => void;
  value: string;
} & FormFieldMetadata) => (
  <Box mb={2.5}>
    <Typography
      component={"label"}
      variant={"smallTextLabels"}
      sx={{
        color: ({ palette }) => palette.gray[70],
        fontWeight: 500,
        lineHeight: 1.5,
      }}
    >
      {label}
      <Box
        component={"span"}
        sx={{ color: ({ palette }) => palette.blue[70], ml: 0.5 }}
      >
        *
      </Box>
      <Box>
        {options ? (
          <Select
            value={value}
            sx={{ width: 250 }}
            onChange={(event) => {
              onChange(event.target.value);
            }}
          >
            {options.map((option) => (
              <MenuItem key={option} value={option}>
                {option}
              </MenuItem>
            ))}
          </Select>
        ) : (
          <TextField
            autoFocus={url}
            multiline={multiline}
            placeholder={placeholder}
            sx={{ width: multiline ? "100%" : 330 }}
            type={type ?? "text"}
            value={value}
            inputProps={
              url
                ? { pattern: "\\S+\\.\\w+", title: "Please enter a valid URL" }
                : undefined
            }
            onChange={(event) => {
              onChange(event.target.value);
            }}
          />
        )}
      </Box>
    </Typography>
  </Box>
);

interface EarlyAccessFormModalProps {
  open: boolean;
  onClose: () => void;
  onSubmit: (properties: ProspectiveUserProperties) => Promise<void>;
}

export const EarlyAccessFormModal = ({
  open,
  onClose,
  onSubmit,
}: EarlyAccessFormModalProps) => {
  const { authenticatedUser } = useAuthenticatedUser();

  const [formState, setFormState] = useState<Record<keyof FormFields, string>>(
    () =>
      typedKeys(formFields).reduce<Record<keyof FormFields, string>>(
        (accumulator, key) => {
          if (key === "https://hash.ai/@hash/types/property-type/email/") {
            accumulator[key] = authenticatedUser.emails[0]!.address;
          } else {
            accumulator[key] = "";
          }

          return accumulator;
        },
        {},
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
      <Box component={"form"} sx={{ px: 4.5, py: 3 }} onSubmit={submitValues}>
        {typedEntries(formFields).map(([key, metadata]) => {
          return (
            <Input
              key={key}
              {...metadata}
              value={formState[key]}
              onChange={(value) => {
                setFormState((currentState) => ({
                  ...currentState,
                  [key]: value,
                }));
              }}
            />
          );
        })}
        <Stack direction={"row"} mt={3} mb={2}>
          <Button
            disabled={!allValuesPresent || pending}
            size={"small"}
            type={"submit"}
          >
            {pending ? "Submitting..." : "Submit answers"}
          </Button>
          <Button
            size={"small"}
            sx={{ ml: 1.5 }}
            type={"button"}
            variant={"tertiary"}
            onClick={onClose}
          >
            Discard
          </Button>
        </Stack>
      </Box>
    </Modal>
  );
};
