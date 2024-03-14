import type {
  DropdownSelectorProps,
  GroupedOptions,
} from "@hashintel/block-design-system";
import {
  codeBlockFormattingPrompt,
  DropdownSelector,
} from "@hashintel/block-design-system";
import { Box } from "@mui/material";

import { CardsIcon } from "../icons/cards";
import { HeartIcon } from "../icons/heart";
import { SkullCrossbonesIcon } from "../icons/skull-crossbones";
import { TruckFastIcon } from "../icons/tuck-fast";

export const systemPrompts = {
  concise: [
    "You are ChatGPT, a large language model trained by OpenAI.",
    "Answer as concisely as possible.",
    codeBlockFormattingPrompt,
    `Current date: ${new Date().toISOString()}.`,
  ].join(" "),
  elaborate: [
    "You are ChatGPT, a large language model trained by OpenAI.",
    "Answer as elaborately as possible.",
    codeBlockFormattingPrompt,
    `Current date: ${new Date().toISOString()}.`,
  ].join(" "),
  sensitive: [
    "You are ChatGPT, a large language model trained by OpenAI.",
    "Answer as sensitively as possible in a caring and compassionate tone.",
    codeBlockFormattingPrompt,
    `Current date: ${new Date().toISOString()}.`,
  ].join(" "),
  pirate: [
    "Pretend you are a pirate.",
    "You have expertise about sailing the 7 seas.",
    "Respond to every message as if you are the pirate talking to me.",
    codeBlockFormattingPrompt,
  ].join(" "),
} as const;

export type SystemPromptId = keyof typeof systemPrompts;

export const isSystemPromptId = (id: string): id is SystemPromptId =>
  Object.keys(systemPrompts).includes(id);

export const defaultSystemPromptId: SystemPromptId = "concise";

enum SystemPromptGroupName {
  Presets = "Presets",
}

const systemPromptByGroup: GroupedOptions<SystemPromptId> = {
  [SystemPromptGroupName.Presets]: {
    name: SystemPromptGroupName.Presets,
    options: [
      {
        id: "concise",
        icon: <TruckFastIcon sx={{ fontSize: "inherit" }} />,
        title: "Concise",
        description: "Short and to the point responses, the default chat mode",
      },
      {
        id: "pirate",
        icon: <SkullCrossbonesIcon sx={{ fontSize: "inherit" }} />,
        title: "Pirate",
        description: "Arr! Responses... pirate style!",
      },
      {
        id: "elaborate",
        icon: <CardsIcon sx={{ fontSize: "inherit" }} />,
        title: "Elaborate",
        description: "Verbose, detailed responses",
      },
      {
        id: "sensitive",
        icon: <HeartIcon sx={{ fontSize: "inherit" }} />,
        title: "Sensitive",
        description:
          "Responses in a more caring, and sensitive-sounding manner",
      },
    ],
  },
};

export const SystemPromptSelector = (
  props: Omit<DropdownSelectorProps<SystemPromptId>, "options" | "renderValue">,
) => (
  <DropdownSelector<SystemPromptId>
    {...props}
    options={systemPromptByGroup}
    renderValue={(selectedOption) => {
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
            {title}
          </Box>{" "}
          mode
        </Box>
      );
    }}
  />
);
