import type { Dispatch, PropsWithChildren, SetStateAction } from "react";
import type { FlowInternetAccessSettings } from "@local/hash-isomorphic-utils/flows/types";
import { Box, Checkbox, Stack, Tooltip, Typography } from "@mui/material";

import { CircleInfoIcon } from "../../../shared/icons/circle-info-icon";

/**
 * Sites where the useful content is gated behind an authentication or paywall,
 * in which case we log a request for the content to be picked up by the user's browser.
 *
 * The user may not have access to these sites, and there may be unlisted sites we hit walls for
 * which the user _does_ have access to. The best solution would be some way of knowing which
 * sites specific user(s) can access.
 *
 * @todo Vary these based on knowledge about which sites users can help us with.
 * @todo Be able to detect other arbitrary sites which hit auth/paywalls (e.g. Via looking for 401 status codes).
 */
export const defaultBrowserPluginDomains = ["linkedin.com"];

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
      <Stack direction={"row"} alignItems={"center"}>
        <Checkbox
          checked={checked}
          disabled={disabled}
          id={checkboxId}
          sx={{
            "& .MuiSvgIcon-root": { fontSize: 18 },
            mr: 1,
            "& rect": disabled
              ? { fill: ({ palette }) => palette.gray[40] }
              : undefined,
          }}
          onChange={() => {
            onChangeChecked(!checked);
          }}
        />
        <Box
          component={"label"}
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
        <Tooltip title={tooltipText} placement={"top"}>
          <Box
            sx={{
              display: "flex",
              ml: 0.7,
              mb: 0.1,
              color: ({ palette }) => palette.common.black,
              fontSize: 12,
            }}
          >
            <CircleInfoIcon fontSize={"inherit"} />
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
  internetAccessSettings: FlowInternetAccessSettings;
  setInternetAccessSettings: (settings: FlowInternetAccessSettings) => void;
}) => {
  return (
    <InternetSetting
      checked={internetAccessSettings.enabled}
      label={"Use public sites"}
      subLabel={"on the World Wide Web"}
      tooltipText={"Whether or not the research task can access the public internet"}
      onChangeChecked={() =>
        { setInternetAccessSettings({
          ...internetAccessSettings,
          enabled: !internetAccessSettings.enabled,
        }); }
      }
    />
  );
};

const BrowserPlugin = ({
  browserPluginSettings,
  disabled,
  setBrowserPluginSettings,
}: {
  browserPluginSettings: FlowInternetAccessSettings["browserPlugin"];
  disabled: boolean;
  setBrowserPluginSettings: (
    settings: FlowInternetAccessSettings["browserPlugin"],
  ) => void;
}) => {
  return (
    <InternetSetting
      checked={browserPluginSettings.enabled}
      disabled={disabled}
      label={"Use browser access"}
      subLabel={"To authenticate as you"}
      tooltipText={"Whether pages can be requested via the browser plugin, taking the content as it appears in your browser"}
      onChangeChecked={() =>
        { setBrowserPluginSettings({
          ...browserPluginSettings,
          enabled: !browserPluginSettings.enabled,
        }); }
      }
    />
  );
};

interface InternetSettingsProps {
  settings: FlowInternetAccessSettings;
  setSettings: Dispatch<SetStateAction<FlowInternetAccessSettings>>;
}

export const InternetSettings = ({
  settings,
  setSettings,
}: InternetSettingsProps) => {
  return (
    <Box>
      <InternetAccess
        internetAccessSettings={settings}
        setInternetAccessSettings={setSettings}
      />
      <Box sx={{ mt: 1 }}>
        <BrowserPlugin
          browserPluginSettings={settings.browserPlugin}
          disabled={!settings.enabled}
          setBrowserPluginSettings={(newBrowserPluginSettings) =>
            { setSettings((currentSettings) => ({
              ...currentSettings,
              browserPlugin: newBrowserPluginSettings,
            })); }
          }
        />
      </Box>
    </Box>
  );
};
