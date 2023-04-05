import {
  DropdownSelector,
  DropdownSelectorProps,
  GroupedOptions,
} from "@blockprotocol/design-system";
import { Box, Typography } from "@mui/material";

import { AbstractAiIcon } from "../../icons/abstract-ai";

export const DEFAULT_MODEL_ID = "gpt-3.5-turbo";

enum ModelGroupName {
  OpenAi = "OpenAI",
}

const MODELS_BY_GROUP: GroupedOptions = {
  [ModelGroupName.OpenAi]: {
    name: ModelGroupName.OpenAi,
    options: [
      {
        id: "gpt-3.5-turbo",
        icon: <AbstractAiIcon sx={{ fontSize: "inherit" }} />,
        title: "GPT-3.5 Turbo",
        helperText: "gpt-3.5-turbo",
        description:
          "The best model for many use cases; faster and 10x cheaper than Davinci",
      },
      {
        id: "text-davinci-003",
        icon: <AbstractAiIcon sx={{ fontSize: "inherit" }} />,
        title: "GPT-3 Davinci",
        helperText: "text-davinci-003",
        description:
          "Great at writing long-form text, complex intent, cause and effect, summarization",
      },
      {
        id: "text-curie-001",
        icon: <AbstractAiIcon sx={{ fontSize: "inherit" }} />,
        title: "GPT-3 Curie",
        helperText: "text-curie-001",
        description: "Good at language translation, Q&A",
      },
      {
        id: "text-babbage-001",
        icon: <AbstractAiIcon sx={{ fontSize: "inherit" }} />,
        title: "GPT-3 Babbage",
        helperText: "text-babbage-001",
        description: "Good at moderate classification tasks",
      },
      {
        id: "text-ada-001",
        icon: <AbstractAiIcon sx={{ fontSize: "inherit" }} />,
        title: "GPT-3 Ada",
        helperText: "text-ada-001",
        description: "Good at parsing, correction, keywords",
      },
    ],
  },
};

export const ModelSelector = (
  props: Omit<DropdownSelectorProps, "options" | "renderValue">,
) => (
  <DropdownSelector
    {...props}
    options={MODELS_BY_GROUP}
    renderValue={(selectedOption, selectedGroup) => {
      const { title, icon } = selectedOption;

      return (
        <Typography
          variant="regularTextLabels"
          sx={{
            display: "inline-flex",
            gap: 1,
            alignItems: "center",
            fontSize: 15,
            lineHeight: 1,
            letterSpacing: -0.02,
            color: ({ palette }) => palette.gray[50],
          }}
        >
          Using
          <Box
            component="span"
            sx={{
              display: "inline-flex",
              gap: 0.375,
              color: ({ palette }) => palette.gray[60],
            }}
          >
            <Box sx={{ display: "flex", alignItems: "center", fontSize: 16 }}>
              {icon}
            </Box>
            {selectedGroup?.name} {title}
          </Box>
        </Typography>
      );
    }}
  />
);
