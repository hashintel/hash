import { IconButton, Select, TextField } from "@hashintel/design-system";
import {
  Box,
  outlinedInputClasses,
  selectClasses,
  Typography,
} from "@mui/material";
import { FunctionComponent } from "react";
import { Controller, useFieldArray, useFormContext } from "react-hook-form";

import { ServiceAccountKind } from "../../../lib/user-and-org";
import { PlusRegularIcon } from "../../../shared/icons/plus-regular";
import { XMarkRegularIcon } from "../../../shared/icons/x-mark-regular-icon";
import { Button, MenuItem } from "../../../shared/ui";
import { UserProfileFormData } from "./user-profile-info-form";
import { urlRegex } from "./util";

const serviceAccountKindOptions: Record<ServiceAccountKind, string> = {
  linkedinAccount: "LinkedIn",
  twitterAccount: "Twitter",
  tiktokAccount: "TikTok",
  facebookAccount: "Facebook",
  instagramAccount: "Instagram",
  githubAccount: "GitHub",
};

export const ServiceAccountsInput: FunctionComponent = () => {
  const {
    control,
    register,
    formState: { errors, touchedFields },
  } = useFormContext<UserProfileFormData>();
  const { fields, append, remove } = useFieldArray({
    control,
    name: "serviceAccounts",
  });

  return (
    <Box display="flex" flexDirection="column" rowGap={1}>
      <Typography
        variant="smallTextLabels"
        sx={({ palette }) => ({
          fontWeight: 500,
          color: palette.gray[70],
        })}
      >
        Social media
      </Typography>
      {fields.map(({ id }, index) => (
        <Box key={id} display="flex" alignItems="center">
          <Controller
            render={({ field }) => (
              <Select
                {...field}
                sx={{
                  [`.${selectClasses.outlined}`]: {
                    background: ({ palette }) => palette.gray[10],
                  },
                  [`.${outlinedInputClasses.notchedOutline}`]: {
                    borderTopRightRadius: 0,
                    borderBottomRightRadius: 0,
                    borderRight: 0,
                  },
                }}
              >
                {Object.entries(serviceAccountKindOptions).map(
                  ([kind, name]) => (
                    <MenuItem key={kind} value={kind}>
                      {name}
                    </MenuItem>
                  ),
                )}
              </Select>
            )}
            control={control}
            name={`serviceAccounts.${index}.kind`}
          />
          <TextField
            fullWidth
            placeholder="Enter your profile URL"
            {...register(`serviceAccounts.${index}.profileUrl`, {
              required: true,
              pattern: {
                value: urlRegex,
                message: "Please enter a valid URL",
              },
            })}
            error={
              touchedFields.serviceAccounts?.[index]?.profileUrl &&
              !!errors.serviceAccounts?.[index]?.profileUrl
            }
            sx={{
              [`.${outlinedInputClasses.root}`]: {
                borderTopLeftRadius: 0,
                borderBottomLeftRadius: 0,
              },
              [`.${outlinedInputClasses.notchedOutline}`]: {
                borderTopLeftRadius: 0,
                borderBottomLeftRadius: 0,
              },
            }}
          />
          <Box marginLeft={1} marginRight={-1}>
            <IconButton onClick={() => remove(index)}>
              <XMarkRegularIcon />
            </IconButton>
          </Box>
        </Box>
      ))}
      <Button
        sx={{ alignSelf: "flex-start" }}
        size="small"
        variant="tertiary"
        onClick={() => append({ kind: "twitterAccount", profileUrl: "" })}
        startIcon={<PlusRegularIcon />}
      >
        Add {fields.length === 0 ? "social media" : "another"}
      </Button>
    </Box>
  );
};
