import { MenuItem, Select } from "@hashintel/design-system";
import {
  Box,
  inputBaseClasses,
  outlinedInputClasses,
  Stack,
  Typography,
} from "@mui/material";
import { ReactNode, useMemo, useState } from "react";

import { AbstractAiIcon } from "../../icons/abstract-ai";

export const DEFAULT_MODEL_ID = "gpt-3.5-turbo";

enum ModelGroupName {
  OpenAi = "OpenAi",
}

interface ModelGroup {
  name: string;
  icon: ReactNode;
  models: Model[];
}

interface Model {
  id: string;
  name: string;
  description: string;
}

const MODELS_BY_GROUP: { [key in ModelGroupName]: ModelGroup } = {
  [ModelGroupName.OpenAi]: {
    name: ModelGroupName.OpenAi,
    icon: <AbstractAiIcon sx={{ fontSize: "inherit" }} />,
    models: [
      {
        id: "gpt-3.5-turbo",
        name: "GPT-3.5 Turbo",
        description:
          "The best model for many use cases; faster and 10x cheaper than Davinci",
      },
      {
        id: "text-davinci-003",
        name: "GPT-3 Davinci",
        description:
          "Great at writing long-form text, complex intent, cause and effect, summarization",
      },
      {
        id: "text-curie-001",
        name: "GPT-3 Curie",
        description: "Good at language translation, Q&A",
      },
      {
        id: "text-babbage-001",
        name: "GPT-3 Babbage",
        description: "Good at moderate classification tasks",
      },
      {
        id: "text-ada-001",
        name: "GPT-3 Ada",
        description: "Good at parsing, correction, keywords",
      },
    ],
  },
};

const INPUT_HEIGHT = 23;
const INPUT_PADDING_TOP = 16;
const INPUT_PADDING_BOTTOM = 12;

export const ModelSelector = ({
  model,
  onModelChange,
}: {
  model: string;
  onModelChange: (model: string) => void;
}) => {
  const [open, setOpen] = useState(false);
  const [selectRef, setSelectRef] = useState<HTMLSelectElement | null>(null);
  const [menuRef, setMenuRef] = useState<HTMLDivElement | null>(null);

  const [selectedModel, selectedGroup] = useMemo(() => {
    const groups = Object.values(MODELS_BY_GROUP);
    for (const group of groups) {
      for (const groupModel of group.models) {
        if (groupModel.id === model) {
          return [groupModel, group];
        }
      }
    }

    return [null, null];
  }, [model]);

  const paperProps = useMemo(() => {
    const inputWidth = selectRef?.offsetWidth ?? 0;
    const paperOffset = INPUT_HEIGHT + INPUT_PADDING_TOP;
    const inputHeight = paperOffset + INPUT_PADDING_BOTTOM;
    const paperWidth = Math.max(inputWidth, 340);
    const paperHeight = (menuRef?.offsetHeight ?? 0) + inputHeight;

    return {
      sx: {
        borderRadius: 1.5,
        overflow: "hidden",
        width: paperWidth,
        height: paperHeight,
        marginTop: `${-paperOffset}px`,
        paddingTop: `${inputHeight}px`,
        marginLeft: `${(paperWidth - inputWidth) / 2}px`,
      },
    };
  }, [menuRef?.offsetHeight, selectRef?.offsetWidth]);

  return (
    <Select
      open={open}
      onOpen={() => setOpen(true)}
      onClose={() => setOpen(false)}
      value={model}
      onChange={(event) => {
        onModelChange(event.target.value);
      }}
      ref={(ref: HTMLSelectElement | null) => {
        if (ref) {
          setSelectRef(ref);
        }
      }}
      renderValue={() => {
        if (selectedModel) {
          const { name } = selectedModel;
          const { name: groupName, icon } = selectedGroup;
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
                <Box sx={{ fontSize: 16 }}>{icon}</Box>
                {groupName} {name}
              </Box>
            </Typography>
          );
        }

        return null;
      }}
      inputProps={{
        sx: {
          paddingY: 0,
          [`~.${outlinedInputClasses.notchedOutline}`]: {
            border: "none !important",
            boxShadow: "none !important",
            background: "none !important",
          },
        },
      }}
      MenuProps={{
        PaperProps: paperProps,
        MenuListProps: {
          sx: {
            padding: 0,
          },
        },
      }}
      sx={{
        [`.${inputBaseClasses.root}`]: {
          boxShadow: "none !important",
        },
        ...(open
          ? {
              position: "relative",
              zIndex: 9999,
            }
          : {}),
      }}
    >
      <Box
        ref={(ref: HTMLDivElement | null) => {
          if (ref) {
            setMenuRef(ref);
          }
        }}
      >
        {Object.values(MODELS_BY_GROUP).map(
          ({ name: groupName, icon, models }) => (
            <Box key={groupName}>
              <Typography
                sx={{
                  fontWeight: 500,
                  fontSize: 12,
                  lineHeight: 1.3,
                  letterSpacing: "0.03em",
                  textTransform: "uppercase",
                  color: ({ palette }) => palette.gray[50],
                  mb: 1,
                  padding: 2,
                  paddingBottom: 0,
                }}
              >
                {groupName}
              </Typography>

              <Stack>
                {models.map(({ id, name, description }) => {
                  const active = id === model;
                  return (
                    <MenuItem
                      key={id}
                      onClick={() => {
                        onModelChange(id);
                        setOpen(false);
                      }}
                      sx={({ palette }) => ({
                        display: "flex",
                        mb: 1,
                        gap: 1.5,
                        ":hover": {
                          ".menu-item-icon": {
                            color: palette.blue[50],
                          },
                          ".menu-item-name": {
                            color: palette.blue[50],
                          },
                          ".menu-item-id": {
                            color: palette.gray[70],
                          },
                          ".menu-item-description": {
                            color: palette.common.black,
                          },
                        },
                      })}
                    >
                      <Box
                        className="menu-item-icon"
                        sx={{
                          paddingX: 1.125,
                          fontSize: 22,
                          color: ({ palette }) =>
                            active ? palette.blue[70] : palette.gray[50],
                        }}
                      >
                        {icon}
                      </Box>

                      <Box>
                        <Box display="flex" gap={1} alignItems="center">
                          <Typography
                            className="menu-item-name"
                            sx={{
                              fontWeight: 500,
                              fontSize: 14,
                              lineHeight: "18px",
                              color: ({ palette }) =>
                                active ? palette.blue[70] : palette.gray[90],
                            }}
                          >
                            {name}
                          </Typography>
                          <Box
                            sx={{
                              width: "4px",
                              height: "4px",
                              background: ({ palette }) => palette.gray[30],
                              borderRadius: "50%",
                            }}
                          />
                          <Typography
                            className="menu-item-id"
                            sx={{
                              fontWeight: 500,
                              fontSize: 13,
                              lineHeight: "18px",
                              color: ({ palette }) =>
                                active ? palette.gray[70] : palette.gray[50],
                            }}
                          >
                            {id}
                          </Typography>
                        </Box>
                        <Typography
                          className="menu-item-description"
                          sx={{
                            fontWeight: 500,
                            fontSize: 13,
                            lineHeight: "18px",
                            color: ({ palette }) =>
                              active ? palette.common.black : palette.gray[70],
                            whiteSpace: "break-spaces",
                          }}
                        >
                          {description}
                        </Typography>
                      </Box>
                    </MenuItem>
                  );
                })}
              </Stack>
            </Box>
          ),
        )}
      </Box>
    </Select>
  );
};
