import "../shared/common.scss";

import { theme } from "@hashintel/design-system/theme";
import { Simplified } from "@local/hash-isomorphic-utils/simplify-properties";
import { User } from "@local/hash-isomorphic-utils/system-types/shared";
import { Box, Skeleton, ThemeProvider } from "@mui/material";
import { useEffect, useState } from "react";
import browser, { Tabs } from "webextension-polyfill";

import { getUser } from "../shared/get-user";
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
  const [loading, setLoading] = useState(true);
  const [me, setMe] = useState<Simplified<User> | null>(null);
  const [activeTab, setActiveTab] = useState<Tabs.Tab | null>(null);

  useEffect(() => {
    const init = async () => {
      await Promise.all([
        getUser().then((maybeMe) => setMe(maybeMe)),
        getCurrentTab().then(setActiveTab),
      ]);

      setLoading(false);
    };

    if (!activeTab) {
      void init();
    }
  }, [activeTab]);

  return (
    <ThemeProvider theme={theme}>
      <Box
        sx={({ palette }) => ({
          height: "100%",
          fontSize: "15px",
          color: palette.common.black,
          border: `1px solid ${palette.gray[20]}`,

          "@media (prefers-color-scheme: dark)": {
            border: `1px solid ${palette.common.black}`,
            color: palette.common.white,
          },
        })}
      >
        {loading ? (
          <Box sx={{ width: 450, paddingX: 2.5, pt: 1, pb: 2 }}>
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
        ) : me ? (
          <ActionCenter activeTab={activeTab} user={me} />
        ) : (
          <SignIn />
        )}
      </Box>
    </ThemeProvider>
  );
};
