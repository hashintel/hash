import { TextField } from "@hashintel/design-system";
import { types } from "@local/hash-isomorphic-utils/ontology-types";
import { EntityId, OwnedById } from "@local/hash-subgraph";
import { Box, outlinedInputClasses, Stack, Typography } from "@mui/material";
import { PropsWithChildren, useState } from "react";
import { Controller, useForm } from "react-hook-form";

import { useShortnameInput } from "../../../../components/hooks/use-shortname-input";
import { Org } from "../../../../lib/user-and-org";
import { useFileUploads } from "../../../../shared/file-upload-context";
import { Button } from "../../../../shared/ui/button";
import { useAuthInfo } from "../../../shared/auth-info-context";
import { ImageField } from "../../shared/image-field";

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
  return <Box mb={3}>{children}</Box>;
};

export type OrgFormData = Omit<Org, "kind" | "entity" | "memberships"> & {
  entity?: Org["entity"];
};

type OrgFormProps = {
  autoFocusDisplayName?: boolean;
  onSubmit: (org: OrgFormData) => Promise<void>;
  /**
   * An existing org to edit. Editing the shortname will not be allowed.
   * Without an existing org, some fields will be hidden from the user.
   */
  org?: OrgFormData;
  readonly: boolean;
  submitLabel: string;
};

export const OrgForm = ({
  autoFocusDisplayName = false,
  readonly,
  onSubmit,
  org: initialOrg,
  submitLabel,
}: OrgFormProps) => {
  const [submissionError, setSubmissionError] = useState("");
  const [loading, setLoading] = useState(false);

  const { refetch: refetchUserAndOrgs } = useAuthInfo();

  const {
    control,
    formState: { errors, isDirty, isValid, touchedFields },
    handleSubmit,
    register,
    reset,
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

  const shortnameWatcher = watch("shortname");

  const shortnameError = getShortnameError(
    errors.shortname?.message,
    !!touchedFields.shortname,
  );

  const nameWatcher = watch("name");

  const existingImageEntity = initialOrg?.hasAvatar?.imageEntity;

  const avatarUrl =
    existingImageEntity?.properties[
      "https://blockprotocol.org/@blockprotocol/types/property-type/file-url/"
    ];

  const { uploadFile } = useFileUploads();

  const setAvatar = async (file: File) => {
    if (!initialOrg?.entity) {
      throw new Error("Cannot set org avatar without the org's entity");
    }

    await uploadFile({
      ownedById: initialOrg.accountGroupId as OwnedById,
      makePublic: true,
      fileData: {
        description: `The avatar for the ${nameWatcher} organization in HASH`,
        file,
        name: `${nameWatcher}'s avatar`,
        ...(existingImageEntity
          ? {
              fileEntityUpdateInput: {
                existingFileEntityId: existingImageEntity.metadata.recordId
                  .entityId as EntityId,
              },
            }
          : {
              fileEntityCreationInput: {
                entityTypeId: types.entityType.imageFile.entityTypeId,
              },
            }),
      },
      ...(initialOrg.hasAvatar
        ? {}
        : {
            linkedEntityData: {
              linkedEntityId: initialOrg.entity.metadata.recordId.entityId,
              linkEntityTypeId: types.linkEntityType.hasAvatar.linkEntityTypeId,
            },
          }),
    });

    // Refetch the authenticated user and their orgs so that avatar changes are reflected immediately in the UI
    void refetchUserAndOrgs();
  };

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

  const isSubmitEnabled = isValid && !loading && isDirty;

  return (
    <Box component="form" onSubmit={innerSubmit} sx={{ px: 5, py: 4 }}>
      <InputGroup>
        <Label
          label="Display name"
          hint="The primary name of your org, as it should appear on HASH"
          htmlFor="name"
          required
        />
        <TextField
          autoFocus={autoFocusDisplayName}
          disabled={readonly}
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
              validate: initialOrg ? () => true : validateShortname,
            }}
            render={({ field }) => (
              <TextField
                autoComplete="off"
                defaultValue={initialOrg?.shortname ?? ""}
                disabled={readonly || !!initialOrg}
                error={!!shortnameError}
                helperText={shortnameError}
                id="shortname"
                onBlur={field.onBlur}
                onChange={(evt) => {
                  const newEvt = { ...evt };
                  newEvt.target.value = parseShortnameInput(
                    newEvt.target.value,
                  );
                  field.onChange(newEvt);
                }}
                InputProps={{
                  startAdornment: (
                    <Box
                      component="span"
                      sx={{
                        marginLeft: 2,
                        marginRight: 0.2,
                        color: ({ palette }) =>
                          shortnameError
                            ? palette.red[80]
                            : initialOrg
                            ? palette.gray[50]
                            : shortnameWatcher === ""
                            ? "#9CA3AF"
                            : palette.gray[80],
                      }}
                    >
                      @
                    </Box>
                  ),
                  sx: {
                    borderColor: shortnameError ? "#FCA5A5" : "initial",
                    "&:focus": {
                      borderColor: shortnameError ? "#EF4444" : "initial",
                    },
                    [`.${outlinedInputClasses.input}`]: {
                      paddingLeft: 0,
                    },
                  },
                }}
                placeholder="acme"
                sx={{ width: 300 }}
              />
            )}
          />
        </Box>
      </InputGroup>
      {initialOrg && (
        <>
          <InputGroup>
            <Label label="Avatar" htmlFor="" />
            <Box width={210} height={210}>
              <ImageField
                readonly={readonly}
                imageUrl={avatarUrl}
                onFileProvided={setAvatar}
              />
            </Box>
          </InputGroup>
          <InputGroup>
            <Label
              label="Description"
              hint="Provide a brief description of your organization"
              htmlFor="description"
            />
            <TextField
              id="description"
              disabled={readonly}
              sx={{ width: 400 }}
              {...register("description", { required: false })}
            />
          </InputGroup>
        </>
      )}
      <InputGroup>
        <Label
          label="Website"
          hint="Provide a link to help others identify your org"
          htmlFor="website"
        />
        <TextField
          id="website"
          disabled={readonly}
          placeholder="https://acme.com"
          sx={{ width: 400 }}
          inputProps={{
            pattern: "http(s?)://.*",
            title:
              "Please enter a valid URL, starting with https:// or http://",
            type: "url",
          }}
          {...register("website", { required: false })}
        />
      </InputGroup>
      {initialOrg && (
        <InputGroup>
          <Label
            label="Location"
            hint="Where is your organization based?"
            htmlFor="location"
          />
          <TextField
            id="location"
            disabled={readonly}
            sx={{ width: 400 }}
            {...register("location", { required: false })}
          />
        </InputGroup>
      )}
      {!readonly && (
        <Box mt={3}>
          <Stack direction="row" spacing={2}>
            <Button disabled={!isSubmitEnabled} type="submit">
              {submitLabel}
            </Button>
            {initialOrg && (
              <Button
                disabled={!isDirty}
                onClick={() => reset(initialOrg)}
                type="button"
                variant="tertiary"
              >
                Discard changes
              </Button>
            )}
          </Stack>
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
      )}
    </Box>
  );
};
