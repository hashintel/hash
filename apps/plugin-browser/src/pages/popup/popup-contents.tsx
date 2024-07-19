import "../shared/common.scss";

import { theme } from "@hashintel/design-system/theme";
import { Box, Skeleton, ThemeProvider } from "@mui/material";
import { useEffect, useState } from "react";
import type { Tabs } from "webextension-polyfill";
import browser from "webextension-polyfill";

import { clearError } from "../../shared/badge";
import { useStorageSync } from "../shared/use-storage-sync";
import { ActionCenter } from "./popup-contents/action-center";
import {
  PopupUserContextProvider,
  useUserContext,
} from "./popup-contents/shared/user-context";
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
const Popup = () => {
  const [activeBrowserTab, setActiveBrowserTab] = useState<Tabs.Tab | null>(
    null,
  );

  const [popupTab, setPopupTab, popupTabLoaded] = useStorageSync(
    "popupTab",
    "one-off",
  );

  const { user, loading: userLoading } = useUserContext();

  useEffect(() => {
    void getCurrentTab().then((tab) => setActiveBrowserTab(tab ?? null));

    void clearError();
  }, []);

  const loading = userLoading || !popupTabLoaded;

  return (
    <ThemeProvider theme={theme}>
      <Box
        sx={({ palette }) => ({
          fontSize: "15px",
          color: palette.common.black,
          border: `1px solid ${palette.gray[10]}`,

          "@media (prefers-color-scheme: dark)": {
            border: `1px solid ${palette.common.black}`,
            color: palette.common.white,
          },
        })}
      >
        {userLoading && (
          <Box sx={{ width: 500, paddingX: 2.5, pt: 1, pb: 2 }}>
            <Skeleton
              height={32}
              sx={{ borderRadius: 1, mb: 2 }}
              variant="rectangular"
            />
          </Box>
        )}
        {loading ? (
          <Box sx={{ height: 200 }} />
        ) : user ? (
          <ActionCenter
            activeBrowserTab={activeBrowserTab}
            popupTab={popupTab}
            setPopupTab={setPopupTab}
            user={user}
          />
        ) : (
          <SignIn />
        )}
      </Box>
    </ThemeProvider>
  );
};

export const PopupContents = () => (
  <PopupUserContextProvider>
    <Popup />
  </PopupUserContextProvider>
);
