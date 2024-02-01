import { Autocomplete, MenuItem } from "@hashintel/design-system";
import { InferenceModelName } from "@local/hash-isomorphic-utils/ai-inference-types";
import { Stack, Typography } from "@mui/material";

import {
  darkModeBorderColor,
  darkModeInputBackgroundColor,
  darkModeInputColor,
} from "../../../../shared/style-values";
import { inputPropsSx, menuItemSx } from "./autocomplete-sx";
import { OpenAiIcon } from "./model-selector/openai-icon";

type ModelOption = {
  value: InferenceModelName;
  label: string;
};

const modelOptions: ModelOption[] = [
  {
    value: "gpt-4-turbo",
    label: "GPT-4 Turbo",
  },
  {
    value: "gpt-4",
    label: "GPT-4",
  },
  {
    value: "gpt-3.5-turbo",
    label: "GPT-3.5 Turbo",
  },
];

type ModelSelectorProps = {
  selectedModel: InferenceModelName;
  setSelectedModel: (model: InferenceModelName) => void;
};

const iconFontSize = 18;

const RenderOptionContent = ({ label }: Pick<ModelOption, "label">) => {
  return (
    <Stack direction="row" alignItems="center">
      <OpenAiIcon sx={{ fontSize: iconFontSize }} />
      <Typography
        sx={{
          fontSize: 14,
          fontWeight: 500,
          ml: 1,
          "@media (prefers-color-scheme: dark)": {
            color: darkModeInputColor,
          },
        }}
      >
        {label}
      </Typography>
    </Stack>
  );
};

const inputHeight = 30;

export const ModelSelector = ({
  selectedModel,
  setSelectedModel,
}: ModelSelectorProps) => {
  const selectedModelOption = modelOptions.find(
    (option) => option.value === selectedModel,
  );

  return (
    <Autocomplete
      autoFocus={false}
      componentsProps={{
        paper: {
          sx: {
            "@media (prefers-color-scheme: dark)": {
              background: darkModeInputBackgroundColor,
              borderColor: darkModeBorderColor,
            },
            p: 0.2,
          },
        },
        popper: { placement: "top" },
      }}
      disableClearable
      inputHeight={inputHeight}
      inputProps={{
        endAdornment: <div />,
        startAdornment: <OpenAiIcon sx={{ fontSize: iconFontSize }} />,
        sx: inputPropsSx({ inputHeight }),
      }}
      multiple={false}
      onChange={(_event, option) => {
        setSelectedModel(option.value);
      }}
      options={modelOptions}
      renderOption={(props, option) => (
        <MenuItem
          {...props}
          key={option.value}
          value={option.value}
          sx={menuItemSx}
        >
          <RenderOptionContent {...option} />
        </MenuItem>
      )}
      sx={{
        width: 150,
      }}
      value={selectedModelOption}
    />
  );
};
