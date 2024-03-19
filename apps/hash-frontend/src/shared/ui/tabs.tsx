import type { TabsProps as MuiTabsProps } from "@mui/material";
import {
  // eslint-disable-next-line no-restricted-imports
  Tabs as MuiTabs,
} from "@mui/material";
import type { FunctionComponent } from "react";
import { useState } from "react";

import { useFontLoadedCallback } from "../../components/hooks/use-font-loaded-callback";

export const Tabs: FunctionComponent<MuiTabsProps> = (props) => {
  const [animateTabs, setAnimateTabs] = useState(false);

  useFontLoadedCallback(
    [
      {
        family: "Open Sauce Two",
        weight: "500",
      },
    ],
    () => setAnimateTabs(true),
  );

  return (
    <MuiTabs
      {...props}
      TabIndicatorProps={{
        sx: {
          ...(!animateTabs ? { transition: "none" } : {}),
        },
      }}
    />
  );
};
