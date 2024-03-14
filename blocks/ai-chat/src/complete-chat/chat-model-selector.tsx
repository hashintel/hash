import type {
  DropdownSelectorProps,
  GroupedOptions,
} from "@hashintel/block-design-system";
import { DropdownSelector } from "@hashintel/block-design-system";
import { Box } from "@mui/material";

import { AbstractAiIcon } from "../icons/abstract-ai";

export const chatModels = ["gpt-3.5-turbo"] as const;

export type ChatModelId = (typeof chatModels)[number];

export const isChatModelId = (value: string): value is ChatModelId =>
  chatModels.includes(value as ChatModelId);

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
        description: "The fastest and cheapest ChatGPT model (default).",
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
