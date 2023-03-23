import {
  DropdownSelector,
  DropdownSelectorProps,
  GroupedOptions,
} from "@hashintel/design-system";
import { Box } from "@mui/material";

import { AbstractAiIcon } from "../icons/abstract-ai";

export const chatModels = ["gpt-3.5-turbo"] as const;

export type ChatModelId = (typeof chatModels)[number];

export const defaultChatModelId: ChatModelId = "gpt-3.5-turbo";

enum ModelGroupName {
  ChatGPT = "ChatGPT",
}

const MODELS_BY_GROUP: GroupedOptions<ChatModelId> = {
  [ModelGroupName.ChatGPT]: {
    name: ModelGroupName.ChatGPT,
    options: [
      {
        id: "gpt-3.5-turbo",
        icon: <AbstractAiIcon sx={{ fontSize: "inherit" }} />,
        title: "OpenAI GPT-3.5 Turbo",
        helperText: "gpt-3.5-turbo",
        /** @todo: improve description */
        description: "The best model for many use cases.",
      },
    ],
  },
};

export const ChatModelSelector = (
  props: Omit<DropdownSelectorProps<ChatModelId>, "options" | "renderValue">,
) => (
  <DropdownSelector<ChatModelId>
    {...props}
    options={MODELS_BY_GROUP}
    renderValue={(selectedOption, selectedGroup) => {
      const { title, icon } = selectedOption;

      return (
        <Box
          component="span"
          sx={{
            display: "inline-flex",
            gap: 0.375,
            fontWeight: 500,
            color: ({ palette }) => palette.gray[50],
          }}
        >
          <Box
            sx={{
              display: "flex",
              alignItems: "center",
              fontSize: 16,
              color: ({ palette }) => palette.gray[60],
            }}
          >
            {icon}
          </Box>
          <Box
            component="span"
            sx={{ color: ({ palette }) => palette.gray[60] }}
          >
            {selectedGroup?.name}
          </Box>{" "}
          ({title})
        </Box>
      );
    }}
  />
);
