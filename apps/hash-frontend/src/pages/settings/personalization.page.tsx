import { Box, Stack, Switch, Typography } from "@mui/material";
import { useState } from "react";

import { useUpdateAuthenticatedUser } from "../../components/hooks/use-update-authenticated-user";
import type { NextPageWithLayout } from "../../shared/layout";
import { useUserPreferences } from "../../shared/use-user-preferences";
import { getSettingsLayout } from "../shared/settings-layout";
import { SettingsPageContainer } from "./shared/settings-page-container";

const SidebarItemDisplaySwitch = ({
  section,
}: {
  section: "entities" | "entityTypes";
}) => {
  const preferences = useUserPreferences();
  const { sidebarSections } = preferences;

  const [updateUser] = useUpdateAuthenticatedUser();

  const [currentDisplay, setCurrentDisplay] = useState<"list" | "link">(
    sidebarSections[section].variant,
  );

  const setSidebarDisplay = ({ variant }: { variant: "link" | "list" }) => {
    setCurrentDisplay(variant);

    void updateUser({
      preferences: {
        ...preferences,
        sidebarSections: {
          ...sidebarSections,
          [section]: {
            ...sidebarSections[section],
            variant,
          },
        },
      },
    });
  };

  return (
    <Stack direction="row" alignItems="center" gap={0.5}>
      <Typography
        component="label"
        htmlFor={`display-${section}`}
        variant="smallTextLabels"
        sx={({ palette }) => ({
          color: palette.gray[80],
          cursor: "pointer",
          fontWeight: 500,
        })}
      >
        {section === "entities" ? "Entities" : "Types"} as a
      </Typography>
      <Typography
        variant="smallTextLabels"
        sx={({ palette }) => ({
          color:
            currentDisplay === "link" ? palette.gray[80] : palette.gray[40],
          fontWeight: 500,
        })}
      >
        link
      </Typography>
      <Switch
        checked={currentDisplay === "list"}
        id={`display-${section}`}
        onChange={() =>
          setSidebarDisplay({
            variant: currentDisplay === "list" ? "link" : "list",
          })
        }
        inputProps={{ "aria-label": "controlled" }}
        size="small"
        sx={{ mx: 0.5 }}
      />
      <Typography
        variant="smallTextLabels"
        sx={({ palette }) => ({
          color:
            currentDisplay === "list" ? palette.gray[80] : palette.gray[40],
          fontWeight: 500,
        })}
      >
        list
      </Typography>
    </Stack>
  );
};

const Personalization: NextPageWithLayout = () => {
  return (
    <SettingsPageContainer
      heading="Personalization"
      subHeading="Improve your experience using HASH"
    >
      <Box px={5} py={3.5}>
        <Typography
          variant="smallTextLabels"
          sx={({ palette }) => ({
            color: palette.gray[70],
            display: "block",
            fontWeight: 500,
            lineHeight: 1,
            mb: 2,
          })}
        >
          In the sidebar, show...
        </Typography>
        <Stack gap={1.5}>
          <SidebarItemDisplaySwitch section="entities" />
          <SidebarItemDisplaySwitch section="entityTypes" />
        </Stack>
      </Box>
    </SettingsPageContainer>
  );
};

Personalization.getLayout = (page) => getSettingsLayout(page);

export default Personalization;
