import { useMutation } from "@apollo/client";
import { TextField } from "@hashintel/design-system";
import { types } from "@local/hash-isomorphic-utils/ontology-types";
import { EntityId, OwnedById } from "@local/hash-subgraph";
import { Box, outlinedInputClasses, Stack, Typography } from "@mui/material";
import { PropsWithChildren, useState } from "react";
import { Controller, useForm } from "react-hook-form";

import { useBlockProtocolArchiveEntity } from "../../../../components/hooks/block-protocol-functions/knowledge/use-block-protocol-archive-entity";
import { useBlockProtocolCreateEntity } from "../../../../components/hooks/block-protocol-functions/knowledge/use-block-protocol-create-entity";
import { useBlockProtocolFileUpload } from "../../../../components/hooks/block-protocol-functions/knowledge/use-block-protocol-file-upload";
import { useShortnameInput } from "../../../../components/hooks/use-shortname-input";
import {
  AddEntityViewerMutation,
  AddEntityViewerMutationVariables,
  AuthorizationSubjectKind,
} from "../../../../graphql/api-types.gen";
import { addEntityViewerMutation } from "../../../../graphql/queries/knowledge/entity.queries";
import { Org } from "../../../../lib/user-and-org";
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
  submitLabel: string;
};

export const OrgForm = ({
  autoFocusDisplayName = false,
  onSubmit,
  org: initialOrg,
  submitLabel,
}: OrgFormProps) => {
  const [submissionError, setSubmissionError] = useState("");
  const [loading, setLoading] = useState(false);

  const { createEntity } = useBlockProtocolCreateEntity(
    (initialOrg?.accountGroupId as OwnedById | undefined) ?? null,
  );
  const { archiveEntity } = useBlockProtocolArchiveEntity();
  const { uploadFile } = useBlockProtocolFileUpload(
    initialOrg?.accountGroupId as OwnedById | undefined,
  );

  const { refetch: refetchUserAndOrgs } = useAuthInfo();

  const { control, formState, handleSubmit, register, reset, watch } =
    useForm<OrgFormData>({
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
    formState.errors.shortname?.message,
    !!formState.touchedFields.shortname,
  );

  const nameWatcher = watch("name");

  const existingImageEntity = initialOrg?.hasAvatar?.imageEntity;

  const avatarUrl =
    existingImageEntity?.properties[
      "https://blockprotocol.org/@blockprotocol/types/property-type/file-url/"
    ];

  const [addEntityViewer] = useMutation<
    AddEntityViewerMutation,
    AddEntityViewerMutationVariables
  >(addEntityViewerMutation);

  const setAvatar = async (file: File) => {
    if (!initialOrg?.entity) {
      throw new Error("Cannot set org avatar without the org's entity");
    }

    // Upload the file and get a file entity which describes it
    const { data: fileUploadData, errors: fileUploadErrors } = await uploadFile(
      {
        data: {
          description: `The avatar for the ${nameWatcher} organization in HASH`,
          name: `${nameWatcher}'s avatar`,
          file,
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
      },
    );
    if (fileUploadErrors || !fileUploadData) {
      throw new Error(
        fileUploadErrors?.[0]?.message ?? "Unknown error uploading file",
      );
    }

    /** @todo: make entity public as part of `createEntity` query once this is supported */
    await addEntityViewer({
      variables: {
        entityId: fileUploadData.metadata.recordId.entityId as EntityId,
        viewer: { kind: AuthorizationSubjectKind.Public },
      },
    });

    if (initialOrg.hasAvatar) {
      // Delete the existing hasAvatar link, if any
      await archiveEntity({
        data: {
          entityId: initialOrg.hasAvatar.linkEntity.metadata.recordId.entityId,
        },
      });
    }

    // Create a new hasAvatar link from the org to the new file entity
    const hasAvatarLinkEntity = await createEntity({
      data: {
        entityTypeId: types.linkEntityType.hasAvatar.linkEntityTypeId,
        linkData: {
          leftEntityId: initialOrg.entity.metadata.recordId.entityId,
          rightEntityId: fileUploadData.metadata.recordId.entityId as EntityId,
        },
        properties: {},
      },
    }).then(({ data, errors }) => {
      if (!data || errors) {
        throw new Error(
          `Error creating hasAvatar link: ${errors?.[0]?.message}`,
        );
      }
      return data;
    });

    /** @todo: make entity public as part of `createEntity` query once this is supported */
    await addEntityViewer({
      variables: {
        entityId: hasAvatarLinkEntity.metadata.recordId.entityId,
        viewer: { kind: AuthorizationSubjectKind.Public },
      },
    });

    // Refetch the authenticated user and their orgs so that avatar changes are reflected immediately in the UI
    void refetchUserAndOrgs();
  };

  const nameError =
    formState.touchedFields.name && !nameWatcher
      ? "Display name is required"
      : "";

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

  const isSubmitEnabled = formState.isValid && !loading && formState.isDirty;

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
              disabled={!formState.isDirty}
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
