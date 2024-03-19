import { Box } from "@mui/material";
import type { Tabs } from "webextension-polyfill";

import type { LocalStorage } from "../../../../shared/storage";
import { InferEntitiesAction } from "./one-off/infer-entities-action";
import { QuickNoteAction } from "./one-off/quick-note-action";

export const OneOff = ({
  activeTab,
  user,
}: {
  activeTab?: Tabs.Tab | null;
  user: NonNullable<LocalStorage["user"]>;
}) => {
  return (
    <Box>
      {user.enabledFeatureFlags.includes("notes") ? <QuickNoteAction /> : null}
      <InferEntitiesAction activeTab={activeTab} user={user} />
    </Box>
  );
};
