import { Box } from "@mui/material";
import type { Tabs } from "webextension-polyfill";

import type { LocalStorage } from "../../../../shared/storage";
import { InferEntitiesAction } from "./one-off/infer-entities-action";
import { QuickNoteAction } from "./one-off/quick-note-action";
import {
  generateTabPanelA11yProps,
  type TabPanelProps,
} from "./shared/tab-props";

export const OneOff = ({
  activeTab,
  user,
  ...panelProps
}: {
  activeTab?: Tabs.Tab | null;
  user: NonNullable<LocalStorage["user"]>;
} & TabPanelProps) => {
  return (
    <Box {...generateTabPanelA11yProps("One-off")} {...panelProps}>
      {user.enabledFeatureFlags.includes("notes") ? <QuickNoteAction /> : null}
      {user.enabledFeatureFlags.includes("ai") ? (
        <InferEntitiesAction activeTab={activeTab} user={user} />
      ) : null}
    </Box>
  );
};
