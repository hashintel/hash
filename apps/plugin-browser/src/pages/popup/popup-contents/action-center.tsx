import { PlusIcon } from "@hashintel/design-system";
import { type Simplified } from "@local/hash-isomorphic-utils/simplify-properties";
import type { User } from "@local/hash-isomorphic-utils/system-types/shared";
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

import { Automated } from "./action-center/automated";
import { OneOff } from "./action-center/one-off";
import { InferEntitiesAction } from "./action-center/one-off/infer-entities-action";
import { QuickNoteAction } from "./action-center/one-off/quick-note-action";
import { WandMagicSparklesIcon } from "./action-center/wand-magic-sparkles-icon";

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
  user: Simplified<User>;
}) => {
  const [popupTab, setPopupTab] = useState<"one-off" | "automated">("one-off");

  return (
    <Box sx={{ maxWidth: "100%", width: 560 }}>
      <Stack
        component="header"
        direction="row"
        sx={({ palette }) => ({
          alignItems: "center",
          background: palette.common.white,
          justifyContent: "space-between",
          px: 2.5,
          "@media (prefers-color-scheme: dark)": {
            background: palette.common.black,
          },
        })}
      >
        <Box>
          <MuiTabs
            onChange={(_event, newValue) =>
              setPopupTab(newValue as "one-off" | "automated")
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
          </MuiTabs>
        </Box>
        <Box
          component="a"
          // @todo handle users who haven't completed signup
          href={`${FRONTEND_ORIGIN}/@${user.properties.shortname!}`}
          sx={({ palette }) => ({
            background: palette.blue[70],
            borderRadius: "50%",
            color: palette.common.white,
            height: 32,
            width: 32,
            fontSize: 18,
            fontWeight: 500,
            lineHeight: "32px",
            textAlign: "center",
            textDecoration: "none",
            transition: ({ transitions }) => transitions.create("opacity"),
            "&:hover": {
              opacity: 0.9,
            },
          })}
          target="_blank"
        >
          {user.properties.preferredName?.[0] ?? "?"}
        </Box>
      </Stack>

      {popupTab === "one-off" ? (
        <OneOff activeTab={activeTab} />
      ) : (
        <Automated />
      )}
    </Box>
  );
};
