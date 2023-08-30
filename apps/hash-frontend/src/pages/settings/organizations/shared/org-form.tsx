import { TextField } from "@hashintel/design-system";
import {
  blockProtocolTypes,
  types,
} from "@local/hash-isomorphic-utils/ontology-types";
import { EntityId, OwnedById } from "@local/hash-subgraph";
import { Box, Stack, Typography } from "@mui/material";
import { PropsWithChildren, useState } from "react";
import { Controller, useForm } from "react-hook-form";

import { useBlockProtocolArchiveEntity } from "../../../../components/hooks/block-protocol-functions/knowledge/use-block-protocol-archive-entity";
import { useBlockProtocolCreateEntity } from "../../../../components/hooks/block-protocol-functions/knowledge/use-block-protocol-create-entity";
import { useBlockProtocolFileUpload } from "../../../../components/hooks/block-protocol-functions/knowledge/use-block-protocol-file-upload";
import { useShortnameInput } from "../../../../components/hooks/use-shortname-input";
import { Org } from "../../../../lib/user-and-org";
import { Button } from "../../../../shared/ui/button";
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

export type OrgFormData = Omit<
  Org,
  "accountId" | "kind" | "entityRecordId" | "memberships"
> & { accountId?: Org["accountId"]; entityRecordId?: Org["entityRecordId"] };

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

  const { createEntity } = useBlockProtocolCreateEntity(
    (initialOrg?.accountId as OwnedById | undefined) ?? null,
  );
  const { archiveEntity } = useBlockProtocolArchiveEntity();
  const { uploadFile } = useBlockProtocolFileUpload(
    initialOrg?.accountId as OwnedById | undefined,
  );

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

  const shortnameError = getShortnameError(
    errors.shortname?.message,
    !!touchedFields.shortname,
  );

  const nameWatcher = watch("name");

  const avatarUrl =
    initialOrg?.hasAvatar?.rightEntity.properties[
      "https://blockprotocol.org/@blockprotocol/types/property-type/file-url/"
    ];

  const setAvatar = async (file: File) => {
    if (!initialOrg?.entityRecordId) {
      throw new Error("Cannot set org avatar without its entityRecordId");
    }

    // Upload the file and get a file entity which describes it
    const { data: fileUploadData, errors: fileUploadErrors } = await uploadFile(
      {
        data: {
          description: `${nameWatcher}'s avatar`,
          entityTypeId: blockProtocolTypes["remote-image-file"].entityTypeId,
          file,
          name: file.name,
        },
      },
    );
    if (fileUploadErrors || !fileUploadData) {
      throw new Error(
        fileUploadErrors?.[0]?.message ?? "Unknown error uploading file",
      );
    }

    if (initialOrg.hasAvatar) {
      // Delete the existing hasAvatar link, if any
      await archiveEntity({
        data: {
          entityId: initialOrg.hasAvatar.linkEntity.metadata.recordId.entityId,
        },
      });
    }

    // Create a new hasAvatar link from the org to the new file entity
    await createEntity({
      data: {
        entityTypeId: types.linkEntityType.hasAvatar.linkEntityTypeId,
        linkData: {
          leftEntityId: initialOrg.entityRecordId.entityId,
          rightEntityId: fileUploadData.metadata.recordId.entityId as EntityId,
        },
        properties: {},
      },
    });
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
              validate: initialOrg ? () => true : validateShortname,
            }}
            render={({ field }) => (
              <TextField
                autoComplete="off"
                defaultValue={initialOrg?.shortname ?? ""}
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
      {initialOrg && (
        <>
          <InputGroup>
            <Label label="Avatar" htmlFor="" />
            <Box width={210} height={210}>
              <ImageField imageUrl={avatarUrl} onFileProvided={setAvatar} />
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
            sx={{ width: 400 }}
            {...register("location", { required: false })}
          />
        </InputGroup>
      )}
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
    </Box>
  );
};
