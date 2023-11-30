import { Simplified } from "@local/hash-isomorphic-utils/simplify-properties";
import { User } from "@local/hash-isomorphic-utils/system-types/shared";
import { Box, Stack } from "@mui/material";
import { Tabs } from "webextension-polyfill";

import { InferEntitiesAction } from "./action-center/infer-entities-action";
import { QuickNoteAction } from "./action-center/quick-note-action";

export const ActionCenter = ({
  activeTab,
  user,
}: {
  activeTab?: Tabs.Tab | null;
  user: Simplified<User>;
}) => {
  return (
    <Box sx={{ maxWidth: "100%", width: 530 }}>
      <Stack
        component="header"
        direction="row"
        sx={({ palette }) => ({
          background: palette.common.white,
          justifyContent: "space-between",
          px: 2.5,
          py: 1,
          "@media (prefers-color-scheme: dark)": {
            background: palette.common.black,
          },
        })}
      >
        <Box />
        <Box
          component="a"
          // @todo handle users who haven't completed signup
          href={`${FRONTEND_ORIGIN}/@${user.properties.shortname!}`}
          sx={({ palette }) => ({
            background: palette.blue[70],
            borderRadius: "50%",
            color: palette.common.white,
            height: 32,
            width: 32,
            fontSize: 18,
            fontWeight: 500,
            lineHeight: "32px",
            textAlign: "center",
            textDecoration: "none",
            transition: ({ transitions }) => transitions.create("opacity"),
            "&:hover": {
              opacity: 0.9,
            },
          })}
          target="_blank"
        >
          {user.properties.preferredName?.[0] ?? "?"}
        </Box>
      </Stack>

      <Box>
        <QuickNoteAction />
        <InferEntitiesAction activeTab={activeTab} />
      </Box>
    </Box>
  );
};
