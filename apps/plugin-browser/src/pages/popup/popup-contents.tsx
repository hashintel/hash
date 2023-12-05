import "../shared/common.scss";

import { theme } from "@hashintel/design-system/theme";
import { Box, Skeleton, ThemeProvider } from "@mui/material";
import { useEffect, useState } from "react";
import browser, { Tabs } from "webextension-polyfill";

import { clearNotifications } from "../../shared/badge";
import { useUser } from "../shared/use-user";
import { ActionCenter } from "./popup-contents/action-center";
import { SignIn } from "./popup-contents/sign-in";

const getCurrentTab = async () => {
  const queryOptions = { active: true, lastFocusedWindow: true };

  // `tab` will either be a `tabs.Tab` instance or `undefined`
  const [tab] = await browser.tabs.query(queryOptions);
  return tab;
};

/**
 * The popup that appears when a user clicks on the extension's icon.
 *
 * You must inspect the popup window itself to see any logs, network events etc.
 * In Firefox this can be done via enabling and running the Browser Toolbox.
 */
export const PopupContents = () => {
  const [activeTab, setActiveTab] = useState<Tabs.Tab | null>(null);

  const { user, loading } = useUser();

  useEffect(() => {
    void getCurrentTab().then(setActiveTab);

    void clearNotifications();
  }, []);

  return (
    <ThemeProvider theme={theme}>
      <Box
        sx={({ palette }) => ({
          height: "100%",
          fontSize: "15px",
          color: palette.common.black,
          border: `1px solid ${palette.gray[20]}`,
          maxHeight: 550,
          overflowY: "scroll",

          "@media (prefers-color-scheme: dark)": {
            border: `1px solid ${palette.common.black}`,
            color: palette.common.white,
          },
        })}
      >
        {loading ? (
          <Box sx={{ width: 500, paddingX: 2.5, pt: 1, pb: 2 }}>
            <Skeleton
              height={32}
              sx={{ borderRadius: 1, mb: 2 }}
              variant="rectangular"
            />
            <Skeleton
              height={150}
              sx={{ borderRadius: 1 }}
              variant="rectangular"
            />
          </Box>
        ) : user ? (
          <ActionCenter activeTab={activeTab} user={user} />
        ) : (
          <SignIn />
        )}
      </Box>
    </ThemeProvider>
  );
};
