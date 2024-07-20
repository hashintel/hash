import { type FunctionComponent, useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { useMutation } from "@apollo/client";
import { Autocomplete, Chip } from "@hashintel/design-system";
import type { BaseUrl } from "@local/hash-graph-types/ontology";
import type { FeatureFlag , featureFlags } from "@local/hash-isomorphic-utils/feature-flags";
import type {
  EnabledFeatureFlagsPropertyValueWithMetadata,
  UserProperties,
} from "@local/hash-isomorphic-utils/system-types/shared";
import { Box, Stack, Typography } from "@mui/material";

import type {
  UpdateEntityMutation,
  UpdateEntityMutationVariables,
} from "../../../graphql/api-types.gen";
import { updateEntityMutation } from "../../../graphql/queries/knowledge/entity.queries";
import type { MinimalUser } from "../../../lib/user-and-org";
import { Button } from "../../../shared/ui";

type BasicInfoFormData = Pick<MinimalUser, "enabledFeatureFlags">;

export const BasicInfoSection: FunctionComponent<{
  user: MinimalUser;
  refetchUser: () => Promise<MinimalUser>;
}> = ({ user, refetchUser }) => {
  const {
    control,
    handleSubmit,
    formState: { isDirty, isValid },
    reset,
    setValue,
  } = useForm<BasicInfoFormData>({
    defaultValues: {
      enabledFeatureFlags: user.enabledFeatureFlags,
    },
  });

  const [loading, setLoading] = useState(false);
  const [submissionError, setSubmissionError] = useState("");

  const [updateEntity] = useMutation<
    UpdateEntityMutation,
    UpdateEntityMutationVariables
  >(updateEntityMutation);

  const innerSubmit = handleSubmit(async (data) => {
    try {
      setLoading(true);

      await updateEntity({
        variables: {
          entityUpdate: {
            entityId: user.entity.metadata.recordId.entityId,
            propertyPatches: [
              {
                op: "add",
                path: [
                  "https://hash.ai/@hash/types/property-type/enabled-feature-flags/" satisfies keyof UserProperties as BaseUrl,
                ],
                property: {
                  value: data.enabledFeatureFlags.map((featureFlag) => ({
                    value: featureFlag,
                    metadata: {
                      dataTypeId:
                        "https://blockprotocol.org/@blockprotocol/types/data-type/text/v/1",
                    },
                  })),
                } satisfies EnabledFeatureFlagsPropertyValueWithMetadata,
              },
            ],
          },
        },
      });

      const refetchedUser = await refetchUser();

      reset(refetchedUser);
    } catch (error) {
      setSubmissionError(
        typeof error === "string" ? error : (error as Error).message,
      );
    } finally {
      setLoading(false);
    }
  });

  const isSubmitEnabled = isValid && !loading && isDirty;

  return (
    <Box
      component={"form"}
      sx={{ px: 5, py: 4, display: "flex", flexDirection: "column", rowGap: 2 }}
      onSubmit={innerSubmit}
    >
      <Controller
        control={control}
        name={"enabledFeatureFlags"}
        render={({ field }) => (
          /**
           * Currently the height of this component is fixed, instead of dynamically
           * increasing based on the number of chips that are currently selected.
           *
           * @todo: support dynamic height in the theme system `Autocomplete` component,
           * or use the base MUI `Autocomplete` component instead.
           */
          <Autocomplete<FeatureFlag, true, false>
            multiple
            value={field.value}
            options={featureFlags}
            inputLabel={"Enabled Feature flags"}
            inputPlaceholder={"Set enabled feature flags..."}
            autoFocus={false}
            getOptionLabel={(featureFlag) =>
              `${featureFlag.slice(0, 1).toUpperCase()}${featureFlag.slice(1)}`
            }
            renderTags={(value, getTagProps) =>
              value.map((option, index) => (
                <Chip
                  {...getTagProps({ index })}
                  key={option}
                  variant={"outlined"}
                  label={`${option.slice(0, 1).toUpperCase()}${option.slice(
                    1,
                  )}`}
                />
              ))
            }
            onChange={(_, updatedFeatureFlags) =>
              { setValue("enabledFeatureFlags", updatedFeatureFlags, {
                shouldDirty: true,
              }); }
            }
          />
        )}
      />
      <Stack direction={"row"} spacing={2}>
        <Button disabled={!isSubmitEnabled} type={"submit"}>
          Save Changes
        </Button>
        <Button
          disabled={!isDirty}
          type={"button"}
          variant={"tertiary"}
          onClick={() => { reset(user); }}
        >
          Discard changes
        </Button>
      </Stack>
      {submissionError && (
        <Typography
          sx={{
            color: ({ palette }) => palette.red[60],
            mt: 1,
          }}
        >
          {submissionError}
        </Typography>
      )}
    </Box>
  );
};
