import { Box } from "@mui/material";
import { Tabs } from "webextension-polyfill";

import { LocalStorage } from "../../../../shared/storage";
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
      <QuickNoteAction />
      <InferEntitiesAction activeTab={activeTab} user={user} />
    </Box>
  );
};
