import { Autocomplete, Chip } from "@hashintel/design-system";
import type { FeatureFlag } from "@local/hash-isomorphic-utils/feature-flags";
import { featureFlags } from "@local/hash-isomorphic-utils/feature-flags";
import type { UserProperties } from "@local/hash-isomorphic-utils/system-types/shared";
import { Box, Stack, Typography } from "@mui/material";
import { type FunctionComponent, useState } from "react";
import { Controller, useForm } from "react-hook-form";

import { useBlockProtocolUpdateEntity } from "../../../components/hooks/block-protocol-functions/knowledge/use-block-protocol-update-entity";
import type { MinimalUser } from "../../../lib/user-and-org";
import { Button } from "../../../shared/ui";

type BasicInfoFormData = Pick<MinimalUser, "enabledFeatureFlags">;

export const BasicInfoSection: FunctionComponent<{
  user: MinimalUser;
}> = ({ user }) => {
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

  const { updateEntity } = useBlockProtocolUpdateEntity();

  const innerSubmit = handleSubmit(async (data) => {
    try {
      setLoading(true);

      const updatedProperties: UserProperties = {
        ...user.entity.properties,
        "https://hash.ai/@hash/types/property-type/enabled-feature-flags/":
          data.enabledFeatureFlags,
      };

      await updateEntity({
        data: {
          entityId: user.entity.metadata.recordId.entityId,
          entityTypeId: user.entity.metadata.entityTypeId,
          properties: updatedProperties,
        },
      });
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
    <Box
      component="form"
      onSubmit={innerSubmit}
      sx={{ px: 5, py: 4, display: "flex", flexDirection: "column", rowGap: 2 }}
    >
      <Controller
        control={control}
        name="enabledFeatureFlags"
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
            getOptionLabel={(featureFlag) =>
              `${featureFlag.slice(0, 1).toUpperCase()}${featureFlag.slice(1)}`
            }
            inputLabel="Enabled Feature flags"
            inputPlaceholder="Set enabled feature flags..."
            onChange={(_, updatedFeatureFlags) =>
              setValue("enabledFeatureFlags", updatedFeatureFlags, {
                shouldDirty: true,
              })
            }
            autoFocus={false}
            renderTags={(value, getTagProps) =>
              value.map((option, index) => (
                <Chip
                  {...getTagProps({ index })}
                  key={option}
                  variant="outlined"
                  label={`${option.slice(0, 1).toUpperCase()}${option.slice(1)}`}
                />
              ))
            }
          />
        )}
      />
      <Stack direction="row" spacing={2}>
        <Button disabled={!isSubmitEnabled} type="submit">
          Save Changes
        </Button>
        <Button
          disabled={!isDirty}
          onClick={() => reset(user)}
          type="button"
          variant="tertiary"
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
