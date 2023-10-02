import { Button } from "@hashintel/design-system";
import { Simplified } from "@local/hash-isomorphic-utils/simplify-properties";
import { User } from "@local/hash-isomorphic-utils/system-types/shared";
import { Subgraph } from "@local/hash-subgraph";
import { Box, Stack, Typography } from "@mui/material";
import { PropsWithChildren, useState } from "react";
import browser, { Tabs } from "webextension-polyfill";

import { Message } from "../../../shared/messages";
import { queryApi } from "../../shared/query-api";
import { TextFieldWithDarkMode } from "./action-center/text-field-with-dark-mode";

const createEntityQuery = /* GraphQL */ `
  mutation createEntity(
    $entityTypeId: VersionedUrl!
    $properties: EntityPropertiesObject!
  ) {
    createEntity(entityTypeId: $entityTypeId, properties: $properties)
  }
`;

const createQuickNote = (text: string) => {
  return queryApi(createEntityQuery, {
    entityTypeId:
      "https://app.hash.ai/@ciaran/types/entity-type/quick-note/v/1",
    properties: {
      "https://blockprotocol.org/@blockprotocol/types/property-type/textual-content/":
        text,
    },
  }).then(({ data }: { data: { createEntity: Subgraph } }) => {
    return data.createEntity;
  });
};

const paddingX = 2.5;

const Action = ({ children }: PropsWithChildren) => {
  return (
    <Box
      sx={({ palette }) => ({
        background: palette.gray[10],
        px: paddingX,
        py: 2,
        "&:not(:last-child)": {
          borderBottom: `1px solid ${palette.gray[30]}`,
        },
        "@media (prefers-color-scheme: dark)": {
          background: "#1f2022",
          color: palette.common.white,

          "&:not(:last-child)": {
            borderBottom: `1px solid ${palette.gray[80]}`,
          },
        },
      })}
    >
      {children}
    </Box>
  );
};

export const ActionCenter = ({
  activeTab,
  user,
}: {
  activeTab?: Tabs.Tab | null;
  user: Simplified<User>;
}) => {
  const [draftQuickNote, setDraftQuickNote] = useState("");

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const requestSiteContent = async () => {
    if (!activeTab?.id) {
      throw new Error("No active tab");
    }

    const message: Message = {
      type: "get-site-content",
    };

    (await browser.tabs.sendMessage(activeTab.id, message)) as Promise<string>;
  };

  const saveQuickNote = () => {
    void createQuickNote(draftQuickNote).then(() => {
      setDraftQuickNote("");
    });
  };

  return (
    <Box sx={{ maxWidth: "100%", width: 480 }}>
      <Stack
        component="header"
        direction="row"
        sx={({ palette }) => ({
          background: palette.common.white,
          justifyContent: "space-between",
          px: paddingX,
          py: 1,
          "@media (prefers-color-scheme: dark)": {
            background: palette.common.black,
          },
        })}
      >
        <Box />
        <Box
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
          })}
        >
          {user.properties.preferredName?.[0] ?? "?"}
        </Box>
      </Stack>

      <Box>
        <Action>
          <Stack direction="row" justifyContent="space-between">
            <Typography
              variant="smallCaps"
              sx={{ fontSize: 13, fontWeight: 600 }}
            >
              Quick note
            </Typography>
            <Box
              component="a"
              href="https://app.hash.ai/@ciaran/types/entity-type/quick-note?tab=entities"
              target="_blank"
              rel="noreferrer"
              sx={{ textDecoration: "none" }}
            >
              <Typography
                variant="microText"
                sx={({ palette }) => ({
                  color: palette.gray[50],
                  fontSize: 14,
                  fontWeight: 500,
                  "&:hover": {
                    color: palette.gray[80],
                    "@media (prefers-color-scheme: dark)": {
                      color: palette.common.white,
                    },
                  },
                })}
              >
                View notes
              </Typography>
            </Box>
          </Stack>
          <Box
            component="form"
            onSubmit={(event) => {
              event.preventDefault();
              saveQuickNote();
            }}
          >
            <TextFieldWithDarkMode
              multiline
              placeholder="Start typing here..."
              minRows={1}
              value={draftQuickNote}
              onChange={(event) => setDraftQuickNote(event.target.value)}
              sx={{ mb: 1.5, mt: 1, width: "100%" }}
            />
            <Button size="small" type="submit">
              Create new entity
            </Button>
          </Box>
        </Action>
      </Box>
    </Box>
  );
};
