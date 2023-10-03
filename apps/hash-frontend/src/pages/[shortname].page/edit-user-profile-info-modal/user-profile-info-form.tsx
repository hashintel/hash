import { TextField } from "@hashintel/design-system";
import { RHFSelect } from "@hashintel/query-editor/src/entity-query-editor/query-form/filter-row/rhf-select";
import { Box } from "@mui/material";
import { FunctionComponent, useState } from "react";
import { useForm } from "react-hook-form";

import { useUpdateAuthenticatedUser } from "../../../components/hooks/use-update-authenticated-user";
import { User } from "../../../lib/user-and-org";
import { Button, MenuItem } from "../../../shared/ui";

export type UserFormData = {
  preferredName: string;
  location?: string;
  website?: string;
  preferredPronouns?: string;
  /** @todo: social media accounts */
};

export const UserProfileInfoForm: FunctionComponent<{
  userProfile: User;
  refetchUserProfile: () => Promise<void>;
}> = ({ userProfile, refetchUserProfile }) => {
  const [loading, setLoading] = useState(false);
  const [updateUser] = useUpdateAuthenticatedUser();

  const { control, register, handleSubmit } = useForm<UserFormData>({
    mode: "all",
    defaultValues: {
      preferredName: userProfile.preferredName,
      location: userProfile.location,
      website: userProfile.website,
      preferredPronouns: userProfile.preferredPronouns,
    },
  });

  const innerSubmit = handleSubmit(async (data) => {
    setLoading(true);

    await updateUser(data);

    /** @todo: error handling */

    setLoading(false);

    void refetchUserProfile();
  });

  return (
    <Box
      component="form"
      onSubmit={innerSubmit}
      sx={{
        "> :not(:last-child)": {
          marginBottom: 3,
        },
      }}
    >
      <TextField
        id="name"
        fullWidth
        label="Preferred name"
        placeholder="Alice"
        required
        {...register("preferredName", { required: true })}
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
        {...register("website")}
      />
      <RHFSelect
        control={control}
        name="preferredPronouns"
        defaultValue=""
        selectProps={{
          label: "Preferred pronouns",
          displayEmpty: true,
          placeholder: "Select pronouns (he/him, she/her, they/them)",
          renderValue: (selected) =>
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
            ),
        }}
      >
        <MenuItem value="">None</MenuItem>
        <MenuItem value="he/him">he/him</MenuItem>
        <MenuItem value="she/her">she/her</MenuItem>
        <MenuItem value="they/them">they/them</MenuItem>
      </RHFSelect>
      <Box display="flex" columnGap={1.5}>
        <Button type="submit" loading={loading}>
          Save changes
        </Button>
        <Button variant="tertiary">Discard</Button>
      </Box>
    </Box>
  );
};
