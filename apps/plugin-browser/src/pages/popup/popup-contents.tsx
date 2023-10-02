import "../shared/common.scss";

import { theme } from "@hashintel/design-system/theme";
import {
  Simplified,
  simplifyProperties,
} from "@local/hash-isomorphic-utils/simplify-properties";
import { User } from "@local/hash-isomorphic-utils/system-types/shared";
import { EntityRootType, Subgraph } from "@local/hash-subgraph";
import { getRoots } from "@local/hash-subgraph/stdlib";
import { Box, ThemeProvider } from "@mui/material";
import { useEffect, useState } from "react";
import browser, { Tabs } from "webextension-polyfill";

import { ActionCenter } from "./popup-contents/action-center";
import { queryApi } from "./popup-contents/query-api";
import { SignIn } from "./popup-contents/sign-in";

const meQuery = /* GraphQL */ `
  {
    me {
      roots
      vertices
    }
  }
`;

const getMe = () => {
  return queryApi(meQuery)
    .then(
      ({
        data: { me: subgraph },
      }: {
        data: { me: Subgraph<EntityRootType> };
      }) => {
        const user = getRoots(subgraph)[0] as unknown as User;
        return {
          ...user,
          properties: simplifyProperties(user.properties),
        };
      },
    )
    .catch(() => null);
};

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
        getMe().then((maybeMe) => setMe(maybeMe)),
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
        {!loading &&
          (!me ? <SignIn /> : <ActionCenter activeTab={activeTab} user={me} />)}
      </Box>
    </ThemeProvider>
  );
};
