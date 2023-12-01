import { Box } from "@mui/material";
import { Tabs } from "webextension-polyfill";

import { InferEntitiesAction } from "./one-off/infer-entities-action";
import { QuickNoteAction } from "./one-off/quick-note-action";

export const OneOff = ({ activeTab }: { activeTab?: Tabs.Tab | null }) => {
  return (
    <Box>
      <QuickNoteAction />
      <InferEntitiesAction activeTab={activeTab} />
    </Box>
  );
};
