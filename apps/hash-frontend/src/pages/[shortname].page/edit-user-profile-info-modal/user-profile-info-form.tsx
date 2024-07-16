import { useMutation } from "@apollo/client";
import { Select, TextField } from "@hashintel/design-system";
import type { Entity, LinkEntity } from "@local/hash-graph-sdk/entity";
import type { OwnedById } from "@local/hash-graph-types/web";
import {
  systemEntityTypes,
  systemLinkEntityTypes,
  systemPropertyTypes,
} from "@local/hash-isomorphic-utils/ontology-type-ids";
import type { ProfileURLPropertyValueWithMetadata } from "@local/hash-isomorphic-utils/system-types/shared";
import { Box } from "@mui/material";
import type { FunctionComponent } from "react";
import { useCallback, useState } from "react";
import { Controller, FormProvider, useForm } from "react-hook-form";

import { useBlockProtocolArchiveEntity } from "../../../components/hooks/block-protocol-functions/knowledge/use-block-protocol-archive-entity";
import { useBlockProtocolCreateEntity } from "../../../components/hooks/block-protocol-functions/knowledge/use-block-protocol-create-entity";
import { useUpdateAuthenticatedUser } from "../../../components/hooks/use-update-authenticated-user";
import type {
  UpdateEntityMutation,
  UpdateEntityMutationVariables,
} from "../../../graphql/api-types.gen";
import { updateEntityMutation } from "../../../graphql/queries/knowledge/entity.queries";
import type {
  ServiceAccountKind,
  User,
  UserServiceAccount,
} from "../../../lib/user-and-org";
import { Button, MenuItem } from "../../../shared/ui";
import { ServiceAccountsInput } from "./service-accounts-input";
import { urlRegex } from "./util";

export type UserProfileFormServiceAccount = {
  existingLinkEntity?: LinkEntity;
  existingServiceAccountEntity?: Entity;
  kind: ServiceAccountKind;
  profileUrl: string;
};

export type UserProfileFormData = {
  displayName: string;
  location?: string;
  websiteUrl?: string;
  preferredPronouns?: string;
  serviceAccounts: UserProfileFormServiceAccount[];
};

export const UserProfileInfoForm: FunctionComponent<{
  userProfile: User;
  refetchUserProfile: () => Promise<void>;
  closeModal: () => void;
}> = ({ userProfile, refetchUserProfile, closeModal }) => {
  const [loading, setLoading] = useState(false);
  const [updateUser] = useUpdateAuthenticatedUser();

  const { archiveEntity } = useBlockProtocolArchiveEntity();
  const { createEntity } = useBlockProtocolCreateEntity(
    userProfile.accountId as OwnedById,
  );

  const [updateEntity] = useMutation<
    UpdateEntityMutation,
    UpdateEntityMutationVariables
  >(updateEntityMutation);

  const formMethods =
    // @ts-expect-error -- type instantiation is excessively deep and possibly infinite, will be fixed when we switch to V8 of react-hook-form (see https://github.com/react-hook-form/react-hook-form/issues/6679)
    useForm<UserProfileFormData>({
      mode: "all",
      defaultValues: {
        displayName: userProfile.displayName,
        location: userProfile.location,
        websiteUrl: userProfile.websiteUrl,
        preferredPronouns: userProfile.preferredPronouns,
        serviceAccounts: userProfile.hasServiceAccounts.map(
          ({ linkEntity, serviceAccountEntity, kind, profileUrl }) => ({
            existingLinkEntity: linkEntity,
            existingServiceAccountEntity: serviceAccountEntity,
            kind,
            profileUrl,
          }),
        ),
      },
    });

  const {
    control,
    register,
    handleSubmit,
    reset,
    formState: { errors, dirtyFields, touchedFields },
  } = formMethods;

  const removeServiceAccount = useCallback(
    async (params: { serviceAccount: UserServiceAccount }) => {
      await archiveEntity({
        data: {
          entityId: params.serviceAccount.linkEntity.metadata.recordId.entityId,
        },
      });
    },
    [archiveEntity],
  );

  const addServiceAccount = useCallback(
    async (params: { kind: ServiceAccountKind; profileUrl: string }) => {
      const { kind, profileUrl } = params;

      const { data: serviceAccountEntity } = await createEntity({
        data: {
          entityTypeId: systemEntityTypes[kind].entityTypeId,
          properties: {
            [systemPropertyTypes.profileUrl.propertyTypeBaseUrl]: profileUrl,
          },
        },
      });

      if (!serviceAccountEntity) {
        throw new Error("Error creating service account entity");
      }

      await createEntity({
        data: {
          linkData: {
            leftEntityId: userProfile.entity.metadata.recordId.entityId,
            rightEntityId: serviceAccountEntity.metadata.recordId.entityId,
          },
          entityTypeId:
            systemLinkEntityTypes.hasServiceAccount.linkEntityTypeId,
          properties: {},
        },
      });
    },
    [createEntity, userProfile],
  );

  const updateServiceAccountProfileUrl = useCallback(
    async (params: {
      serviceAccount: Required<UserProfileFormServiceAccount>;
    }) => {
      const {
        serviceAccount: { existingServiceAccountEntity, profileUrl },
      } = params;
      await updateEntity({
        variables: {
          entityUpdate: {
            entityId: existingServiceAccountEntity.metadata.recordId.entityId,
            propertyPatches: [
              {
                op: "add",
                path: [systemPropertyTypes.profileUrl.propertyTypeBaseUrl],
                property: {
                  value: profileUrl,
                  metadata: {
                    dataTypeId:
                      "https://blockprotocol.org/@blockprotocol/types/data-type/text/v/1",
                  },
                } satisfies ProfileURLPropertyValueWithMetadata,
              },
            ],
          },
        },
      });
    },
    [updateEntity],
  );

  const updateServiceAccounts = useCallback(
    async (params: {
      serviceAccounts: UserProfileFormData["serviceAccounts"];
    }) => {
      const { serviceAccounts } = params;

      const removedServiceAccounts = userProfile.hasServiceAccounts.filter(
        ({ linkEntity }) =>
          !serviceAccounts.find(
            ({ existingLinkEntity }) =>
              existingLinkEntity &&
              existingLinkEntity.metadata.recordId.entityId ===
                linkEntity.metadata.recordId.entityId,
          ),
      );

      const addedServiceAccounts = serviceAccounts.filter(
        ({ existingLinkEntity }) => !existingLinkEntity,
      );

      const serviceAccountProfileUrlsToUpdate = serviceAccounts.filter(
        (
          serviceAccount,
        ): serviceAccount is Required<UserProfileFormServiceAccount> => {
          if (!serviceAccount.existingLinkEntity) {
            return false;
          }

          const previousServiceAccount = userProfile.hasServiceAccounts.find(
            ({ linkEntity }) =>
              linkEntity.metadata.recordId.entityId ===
              serviceAccount.existingLinkEntity!.metadata.recordId.entityId,
          );

          if (!previousServiceAccount) {
            throw new Error("Could not find previous service account");
          }

          return (
            previousServiceAccount.kind === serviceAccount.kind &&
            previousServiceAccount.profileUrl !== serviceAccount.profileUrl
          );
        },
      );

      const serviceAccountsToReplace = serviceAccounts.filter(
        (
          serviceAccount,
        ): serviceAccount is Required<UserProfileFormServiceAccount> => {
          if (!serviceAccount.existingLinkEntity) {
            return false;
          }

          const previousServiceAccount = userProfile.hasServiceAccounts.find(
            ({ linkEntity }) =>
              linkEntity.metadata.recordId.entityId ===
              serviceAccount.existingLinkEntity!.metadata.recordId.entityId,
          );

          if (!previousServiceAccount) {
            throw new Error("Could not find previous service account");
          }

          return previousServiceAccount.kind !== serviceAccount.kind;
        },
      );

      await Promise.all([
        removedServiceAccounts.map((serviceAccount) =>
          removeServiceAccount({ serviceAccount }),
        ),
        addedServiceAccounts.map(({ kind, profileUrl }) =>
          addServiceAccount({ kind, profileUrl }),
        ),
        serviceAccountProfileUrlsToUpdate.map((serviceAccount) =>
          updateServiceAccountProfileUrl({ serviceAccount }),
        ),
        serviceAccountsToReplace.map(
          async (serviceAccount) =>
            await Promise.all([
              removeServiceAccount({
                serviceAccount: {
                  ...serviceAccount,
                  linkEntity: serviceAccount.existingLinkEntity,
                  serviceAccountEntity:
                    serviceAccount.existingServiceAccountEntity,
                },
              }),
              addServiceAccount({
                kind: serviceAccount.kind,
                profileUrl: serviceAccount.profileUrl,
              }),
            ]),
        ),
      ]);
    },
    [
      userProfile,
      removeServiceAccount,
      addServiceAccount,
      updateServiceAccountProfileUrl,
    ],
  );

  const innerSubmit = handleSubmit(async (data) => {
    setLoading(true);

    const { serviceAccounts, ...userData } = data;

    await Promise.all([
      updateServiceAccounts({ serviceAccounts }),
      updateUser(userData),
    ]);

    /** @todo: error handling */

    setLoading(false);

    void refetchUserProfile();

    closeModal();
  });

  const handleDiscard = useCallback(() => {
    reset();
    closeModal();
  }, [reset, closeModal]);

  const isSubmitDisabled =
    Object.keys(errors).length > 0 || Object.keys(dirtyFields).length === 0;

  return (
    <Box
      component="form"
      onSubmit={innerSubmit}
      sx={{
        marginTop: 2,
        "> :not(:last-child)": {
          marginBottom: 3,
        },
      }}
    >
      <FormProvider {...formMethods}>
        <TextField
          id="name"
          fullWidth
          label="Preferred name"
          placeholder="Enter your preferred name"
          required
          error={touchedFields.displayName && !!errors.displayName}
          {...register("displayName", { required: true })}
        />
        <TextField
          fullWidth
          label="Location"
          placeholder="Enter your current city/location"
          {...register("location")}
        />
        <TextField
          fullWidth
          label="Website URL"
          placeholder="Enter a website, e.g. https://example.com/"
          error={touchedFields.websiteUrl && !!errors.websiteUrl}
          {...register("websiteUrl", {
            pattern: {
              value: urlRegex,
              message: "Please enter a valid URL",
            },
          })}
        />
        <Controller
          control={control}
          name="preferredPronouns"
          defaultValue=""
          render={({ field }) => (
            <Select
              {...field}
              label="Preferred pronouns"
              displayEmpty
              placeholder="Select pronouns (he/him, she/her, they/them)"
              renderValue={(selected) =>
                selected === "" ? (
                  <Box
                    component="span"
                    sx={{
                      color: ({ palette }) => palette.gray[50],
                    }}
                  >
                    Select pronouns (he/him, she/her, they/them)
                  </Box>
                ) : (
                  <>{String(selected)}</>
                )
              }
            >
              <MenuItem value="">None</MenuItem>
              <MenuItem value="he/him">he/him</MenuItem>
              <MenuItem value="she/her">she/her</MenuItem>
              <MenuItem value="they/them">they/them</MenuItem>
            </Select>
          )}
        />
        <ServiceAccountsInput />
        <Box display="flex" columnGap={1.5}>
          <Button type="submit" loading={loading} disabled={isSubmitDisabled}>
            Save changes
          </Button>
          <Button variant="tertiary" onClick={handleDiscard}>
            {Object.keys(dirtyFields).length === 0 ? "Cancel" : "Discard"}
          </Button>
        </Box>
      </FormProvider>
    </Box>
  );
};
