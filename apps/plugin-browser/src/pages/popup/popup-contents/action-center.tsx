import {
  ListRegularIcon,
  PlusIcon,
  WandMagicSparklesIcon,
} from "@hashintel/design-system";
import type { SvgIconProps, TabProps as MuiTabProps } from "@mui/material";
import {
  Box,
  Stack,
  Tab as MuiTab,
  Tabs as MuiTabs,
  Typography,
} from "@mui/material";
import type { FunctionComponent } from "react";
import type { Tabs } from "webextension-polyfill";

import { createDefaultSettings } from "../../../shared/create-default-settings";
import type { LocalStorage } from "../../../shared/storage";
import {
  darkModeBorderColor,
  lightModeBorderColor,
} from "../../shared/style-values";
import { useStorageSync } from "../../shared/use-storage-sync";
import { Automated } from "./action-center/automated";
import { History } from "./action-center/history";
import { OneOff } from "./action-center/one-off";
import { generateTabA11yProps } from "./action-center/shared/tab-props";
import { Avatar } from "./shared/avatar";
import { popupWidth } from "./shared/sizing";

const generateCommonTabProps = (
  active: boolean,
  label: "One-off" | "Automated" | "History",
  Icon: FunctionComponent<SvgIconProps>,
): MuiTabProps => ({
  disableRipple: true,
  iconPosition: "start",
  icon: (
    <Icon
      sx={{
        fontSize: 15,
        fill: ({ palette }) => (active ? palette.blue[70] : palette.gray[70]),
      }}
    />
  ),
  ...generateTabA11yProps(label),
  label: (
    <Typography sx={{ fontWeight: 500, fontSize: 14 }}>{label}</Typography>
  ),
  sx: ({ palette }) => ({
    borderBottom: active
      ? `3px solid ${palette.blue[70]}`
      : `3px solid transparent`,
    pl: 0.5,
    pr: 0.7,
    py: 1.5,
    mr: 2,
    color: active ? palette.blue[70] : palette.gray[70],
  }),
});

const popupTabIndex = {
  "one-off": 0,
  automated: 1,
  history: 2,
} as const;

export const ActionCenter = ({
  activeBrowserTab,
  popupTab,
  setPopupTab,
  user,
}: {
  activeBrowserTab?: Tabs.Tab | null;
  popupTab: NonNullable<LocalStorage["popupTab"]>;
  setPopupTab: (popupTab: NonNullable<LocalStorage["popupTab"]>) => void;
  user: NonNullable<LocalStorage["user"]>;
}) => {
  const [automaticInferenceConfig, setAutomaticInferenceConfig] =
    useStorageSync(
      "automaticInferenceConfig",
      createDefaultSettings({ userWebWebId: user.webWebId })
        .automaticInferenceConfig,
    );

  const tabValueAsNumber = popupTabIndex[popupTab];

  return (
    <Box sx={{ maxWidth: "100%", width: popupWidth, minHeight: 400 }}>
      <Stack
        component="header"
        direction="row"
        sx={({ palette, boxShadows }) => ({
          alignItems: "center",
          background: palette.common.white,
          borderBottom: `1px solid ${lightModeBorderColor}`,
          boxShadow: boxShadows.sm,
          justifyContent: "space-between",
          px: 2.5,
          "@media (prefers-color-scheme: dark)": {
            background: palette.common.black,
            borderBottom: `1px solid ${darkModeBorderColor}`,
          },
        })}
      >
        <Box>
          <MuiTabs
            onChange={(_event, newValue) =>
              setPopupTab(newValue as "one-off" | "automated" | "history")
            }
            TabIndicatorProps={{ sx: { transition: "none" } }}
            value={popupTab}
          >
            <MuiTab
              value="one-off"
              {...generateCommonTabProps(
                popupTab === "one-off",
                "One-off",
                PlusIcon,
              )}
            />
            {user.enabledFeatureFlags.includes("ai") ? (
              <MuiTab
                value="automated"
                {...generateCommonTabProps(
                  popupTab === "automated",
                  "Automated",
                  WandMagicSparklesIcon,
                )}
              />
            ) : null}
            {user.enabledFeatureFlags.includes("ai") ? (
              <MuiTab
                value="history"
                {...generateCommonTabProps(
                  popupTab === "history",
                  "History",
                  ListRegularIcon,
                )}
              />
            ) : null}
          </MuiTabs>
        </Box>
        <Avatar
          avatar={user.avatar}
          href={
            user.properties.shortname
              ? `${FRONTEND_ORIGIN}/@${user.properties.shortname}`
              : undefined
          }
          name={user.properties.displayName}
        />
      </Stack>
      <Box sx={{ maxHeight: 545, overflowY: "scroll" }}>
        {popupTab === "one-off" ? (
          <OneOff
            activeTab={activeBrowserTab}
            user={user}
            index={0}
            value={tabValueAsNumber}
          />
        ) : popupTab === "automated" ? (
          <Automated
            automaticInferenceConfig={automaticInferenceConfig}
            setAutomaticInferenceConfig={setAutomaticInferenceConfig}
            user={user}
            index={1}
            value={tabValueAsNumber}
          />
        ) : (
          <History index={2} value={tabValueAsNumber} />
        )}
      </Box>
    </Box>
  );
};
