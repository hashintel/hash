import { ListRegularIcon, PlusIcon } from "@hashintel/design-system";
import {
  Box,
  Stack,
  SvgIconProps,
  Tab as MuiTab,
  TabProps as MuiTabProps,
  Tabs as MuiTabs,
  Typography,
} from "@mui/material";
import { FunctionComponent, useState } from "react";
import type { Tabs } from "webextension-polyfill";

import { LocalStorage } from "../../../shared/storage";
import {
  darkModeBorderColor,
  lightModeBorderColor,
} from "../../shared/style-values";
import { useLocalStorage } from "../../shared/use-local-storage";
import { Automated } from "./action-center/automated";
import { Log } from "./action-center/log";
import { OneOff } from "./action-center/one-off";
import { WandMagicSparklesIcon } from "./action-center/wand-magic-sparkles-icon";
import { Avatar } from "./shared/avatar";
import { popupWidth } from "./shared/sizing";

const generateCommonTabProps = (
  active: boolean,
  label: string,
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

export const ActionCenter = ({
  activeTab,
  user,
}: {
  activeTab?: Tabs.Tab | null;
  user: NonNullable<LocalStorage["user"]>;
}) => {
  const [popupTab, setPopupTab] = useState<"one-off" | "automated" | "log">(
    "one-off",
  );

  const [automaticInferenceConfig, setAutomaticInferenceConfig] =
    useLocalStorage("automaticInferenceConfig", {
      createAs: "draft",
      enabled: false,
      model: "gpt-4-turbo",
      ownedById: user.webOwnedById,
      rules: [],
    });

  const [inferenceRequests] = useLocalStorage("inferenceRequests", []);

  return (
    <Box sx={{ maxWidth: "100%", width: popupWidth }}>
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
              setPopupTab(newValue as "one-off" | "automated" | "log")
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
            <MuiTab
              value="automated"
              {...generateCommonTabProps(
                popupTab === "automated",
                "Automated",
                WandMagicSparklesIcon,
              )}
            />
            <MuiTab
              value="log"
              {...generateCommonTabProps(
                popupTab === "log",
                "Log",
                ListRegularIcon,
              )}
            />
          </MuiTabs>
        </Box>
        <Avatar
          avatar={user.avatar}
          href={
            user.properties.shortname
              ? `${FRONTEND_ORIGIN}/@${user.properties.shortname}`
              : undefined
          }
          // @todo handle users who haven't signed up
          name={user.properties.preferredName ?? "?"}
        />
      </Stack>
      <Box sx={{ maxHeight: 545, overflowY: "scroll" }}>
        {popupTab === "one-off" ? (
          <OneOff activeTab={activeTab} user={user} />
        ) : popupTab === "automated" ? (
          <Automated
            automaticInferenceConfig={automaticInferenceConfig}
            setAutomaticInferenceConfig={setAutomaticInferenceConfig}
            user={user}
          />
        ) : (
          <Log inferenceRequests={inferenceRequests} user={user} />
        )}
      </Box>
    </Box>
  );
};
