import { TextField } from "@hashintel/design-system";
import { Box, Stack, Typography } from "@mui/material";
import { PropsWithChildren, useState } from "react";
import { Controller, useForm } from "react-hook-form";

import { useShortnameInput } from "../../components/hooks/use-shortname-input";
import { MinimalOrg } from "../../lib/user-and-org";
import { Button } from "../../shared/ui/button";

const Label = ({
  label,
  hint,
  htmlFor,
  required,
}: {
  label: string;
  hint?: string;
  htmlFor: string;
  required?: boolean;
}) => {
  return (
    <Stack component="label" htmlFor={htmlFor} spacing={0.5} mb={1.2}>
      <Stack direction="row">
        <Typography
          variant="smallTextLabels"
          sx={{ color: "gray.70", fontWeight: 500 }}
        >
          {label}
        </Typography>
        {required ? (
          <Typography
            variant="smallTextLabels"
            sx={{
              color: "blue.70",
              ml: 0.4,
              alignSelf: "flex-start",
              lineHeight: 1.3,
            }}
          >
            *
          </Typography>
        ) : (
          <Typography sx={{ color: "gray.70", fontSize: 12, ml: 1 }}>
            Optional
          </Typography>
        )}
      </Stack>
      {hint && (
        <Typography
          variant="smallTextLabels"
          sx={{ color: "gray.70", fontWeight: 400 }}
        >
          {hint}
        </Typography>
      )}
    </Stack>
  );
};

const InputGroup = ({ children }: PropsWithChildren) => {
  return <Box mt={3}>{children}</Box>;
};

export type OrgFormData = Omit<
  MinimalOrg,
  "accountId" | "kind" | "entityRecordId"
>;

type OrgFormProps = {
  onSubmit: (org: OrgFormData) => Promise<void>;
  /**
   * An existing org to edit. Editing the shortname will not be allowed.
   * Without an existing org, some fields will be hidden from the user.
   */
  org?: OrgFormData;
  submitLabel: string;
};

export const OrgForm = ({
  onSubmit,
  org: initialOrg,
  submitLabel,
}: OrgFormProps) => {
  const [submissionError, setSubmissionError] = useState("");
  const [loading, setLoading] = useState(false);

  const {
    control,
    formState: { errors, isValid, touchedFields },
    handleSubmit,
    register,
    watch,
  } = useForm<OrgFormData>({
    mode: "all",
    defaultValues: {
      description: initialOrg?.description ?? "",
      name: initialOrg?.name ?? "",
      location: initialOrg?.location ?? "",
      shortname: initialOrg?.shortname ?? "",
      website: initialOrg?.website ?? "",
    },
  });

  const { validateShortname, parseShortnameInput, getShortnameError } =
    useShortnameInput();

  const shortnameError = getShortnameError(
    errors.shortname?.message,
    !!touchedFields.shortname,
  );

  const nameWatcher = watch("name");

  const nameError =
    touchedFields.name && !nameWatcher ? "Display name is required" : "";

  const innerSubmit = handleSubmit(async (data) => {
    try {
      setLoading(true);
      await onSubmit(data);
    } catch (err) {
      setSubmissionError(
        typeof err === "string" ? err : (err as Error).message,
      );
    } finally {
      setLoading(false);
    }
  });

  return (
    <Box component="form" onSubmit={innerSubmit} sx={{ background: "white" }}>
      <InputGroup>
        <Label
          label="Display name"
          hint="The primary name of your org, as it should appear on HASH"
          htmlFor="name"
          required
        />
        <TextField
          autoFocus
          error={!!nameError}
          id="name"
          helperText={nameError}
          placeholder="e.g. Acme Corp"
          {...register("name", { required: true })}
          sx={{ width: 300 }}
        />
      </InputGroup>
      <InputGroup>
        <Label
          label="Username"
          hint="Once set, an org's username cannot be changed"
          htmlFor="shortname"
          required
        />
        <Box style={{ position: "relative" }}>
          <Controller
            control={control}
            name="shortname"
            rules={{
              validate: validateShortname,
            }}
            render={({ field }) => (
              <TextField
                autoComplete="off"
                disabled={!!initialOrg}
                error={!!shortnameError}
                helperText={shortnameError}
                id="shortname"
                inputProps={{
                  sx: {
                    borderColor: shortnameError ? "#FCA5A5" : "initial",
                    "&:focus": {
                      borderColor: shortnameError ? "#EF4444" : "initial",
                    },
                    paddingLeft: "2.25rem",
                  },
                }}
                onBlur={field.onBlur}
                onChange={(evt) => {
                  const newEvt = { ...evt };
                  newEvt.target.value = parseShortnameInput(
                    newEvt.target.value,
                  );
                  field.onChange(newEvt);
                }}
                placeholder="acme"
                sx={{ width: 300 }}
              />
            )}
          />
          <span
            style={{
              position: "absolute",
              left: "1rem",
              top: "1.5rem",
              transform: "translateY(-50%)",
              color: "#9CA3AF",
            }}
          >
            @
          </span>
        </Box>
      </InputGroup>
      <InputGroup>
        <Label
          label="Website"
          hint="Provide a link to help others identify your org"
          htmlFor="website"
        />
        <TextField
          id="name"
          placeholder="https://acme.com"
          sx={{ width: 400 }}
          {...register("website", { required: false })}
        />
      </InputGroup>
      <Box mt={3}>
        <Button disabled={!isValid || loading} type="submit">
          {submitLabel}
        </Button>
        {submissionError && (
          <Typography
            sx={{
              color: "red.60",
              mt: 1,
            }}
          >
            {submissionError}
          </Typography>
        )}
      </Box>
    </Box>
  );
};
