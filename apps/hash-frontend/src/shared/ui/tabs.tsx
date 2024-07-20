import type { FunctionComponent , useState } from "react";
import type {   // eslint-disable-next-line no-restricted-imports
  Tabs as MuiTabs,
TabsProps as MuiTabsProps ,
} from "@mui/material";

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
    () => { setAnimateTabs(true); },
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
