import { Box, Checkbox, Stack, Tooltip, Typography } from "@mui/material";
import type { Dispatch, PropsWithChildren, SetStateAction } from "react";

import { CircleInfoIcon } from "../../../shared/icons/circle-info-icon";

type InternetAccessSettings = {
  enabled: boolean;
};

type BrowserPluginSettings = {
  enabled: boolean;
  domains: string[];
};

const InternetSetting = ({
  checked,
  disabled,
  onChangeChecked,
  label,
  subLabel,
  tooltipText,
}: PropsWithChildren<{
  checked: boolean;
  disabled?: boolean;
  onChangeChecked: (checked: boolean) => void;
  label: string;
  subLabel: string;
  tooltipText: string;
}>) => {
  const checkboxId = `internet-settings-${label}-checkbox`;

  return (
    <Box mb={2}>
      <Stack direction="row" alignItems="center">
        <Checkbox
          checked={checked}
          disabled={disabled}
          id={checkboxId}
          onChange={() => {
            onChangeChecked(!checked);
          }}
          sx={{
            "& .MuiSvgIcon-root": { fontSize: 18 },
            mr: 1,
            "& rect": disabled
              ? { fill: ({ palette }) => palette.gray[40] }
              : undefined,
          }}
        />
        <Box
          component="label"
          htmlFor={checkboxId}
          sx={{
            fontSize: 14,
            color: ({ palette }) =>
              disabled ? palette.gray[50] : palette.common.black,
            cursor: "pointer",
          }}
        >
          {label}
        </Box>
        <Tooltip title={tooltipText} placement="top">
          <Box
            sx={{
              display: "flex",
              ml: 0.7,
              mb: 0.1,
              color: ({ palette }) => palette.common.black,
              fontSize: 12,
            }}
          >
            <CircleInfoIcon fontSize="inherit" />
          </Box>
        </Tooltip>
      </Stack>
      <Typography
        sx={{
          fontSize: 14,
          color: ({ palette }) =>
            disabled ? palette.gray[40] : palette.gray[60],
          lineHeight: 1,
          ml: 3.3,
          mt: 0.3,
        }}
      >
        {subLabel}
      </Typography>
    </Box>
  );
};

const InternetAccess = ({
  internetAccessSettings,
  setInternetAccessSettings,
}: {
  internetAccessSettings: InternetAccessSettings;
  setInternetAccessSettings: (settings: InternetAccessSettings) => void;
}) => {
  return (
    <InternetSetting
      checked={internetAccessSettings.enabled}
      onChangeChecked={() =>
        setInternetAccessSettings({ enabled: !internetAccessSettings.enabled })
      }
      label="Use public sites"
      subLabel="on the World Wide Web"
      tooltipText="Whether or not the research task can access the public internet"
    />
  );
};

const BrowserPlugin = ({
  browserPluginSettings,
  disabled,
  setBrowserPluginSettings,
}: {
  browserPluginSettings: BrowserPluginSettings;
  disabled: boolean;
  setBrowserPluginSettings: (settings: BrowserPluginSettings) => void;
}) => {
  return (
    <InternetSetting
      checked={browserPluginSettings.enabled}
      disabled={disabled}
      onChangeChecked={() =>
        setBrowserPluginSettings({
          ...browserPluginSettings,
          enabled: !browserPluginSettings.enabled,
        })
      }
      label="Use browser access"
      subLabel="To authenticate as you"
      tooltipText="Whether pages can be requested via the browser plugin, taking the content as it appears in your browser"
    />
  );
};

export type InternetSettingsState = {
  internet: InternetAccessSettings;
  browserPlugin: BrowserPluginSettings;
};

type InternetSettingsProps = {
  settings: InternetSettingsState;
  setSettings: Dispatch<SetStateAction<InternetSettingsState>>;
};

export const InternetSettings = ({
  settings,
  setSettings,
}: InternetSettingsProps) => {
  return (
    <Box>
      <InternetAccess
        internetAccessSettings={settings.internet}
        setInternetAccessSettings={(newInternetAccessSettings) =>
          setSettings((currentSettings) => ({
            ...currentSettings,
            internet: newInternetAccessSettings,
          }))
        }
      />
      <Box sx={{ mt: 1 }}>
        <BrowserPlugin
          browserPluginSettings={settings.browserPlugin}
          disabled={!settings.internet.enabled}
          setBrowserPluginSettings={(newBrowserPluginSettings) =>
            setSettings((currentSettings) => ({
              ...currentSettings,
              browserPlugin: newBrowserPluginSettings,
            }))
          }
        />
      </Box>
    </Box>
  );
};
