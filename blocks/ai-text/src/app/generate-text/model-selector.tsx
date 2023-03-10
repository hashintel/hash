import { MenuItem, Select } from "@hashintel/design-system";
import {
  Box,
  inputBaseClasses,
  ListSubheader,
  menuItemClasses,
  outlinedInputClasses,
  selectClasses,
  SelectProps,
  Typography,
} from "@mui/material";
import { ReactNode, useMemo, useState } from "react";

import { AbstractAiIcon } from "../../icons/abstract-ai";
import { CaretDownIcon } from "../../icons/caret-down";
import { CheckIcon } from "../../icons/check";

export const DEFAULT_MODEL_ID = "gpt-3.5-turbo";

enum ModelGroupName {
  OpenAi = "OpenAI",
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

export const ModelSelector = ({
  model,
  onModelChange,
  open,
  ...props
}: {
  model: string;
  onModelChange: (model: string) => void;
} & Pick<SelectProps, "open" | "onOpen" | "onClose">) => {
  const [selectRef, setSelectRef] = useState<HTMLSelectElement | null>(null);

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
    const paperWidth = Math.max(inputWidth, 340);

    return {
      sx: {
        borderRadius: 1.5,
        boxSizing: "border-box",
        overflow: "hidden",
        width: paperWidth,
        marginTop: `${-paperOffset}px`,
        marginLeft: `${(paperWidth - inputWidth) / 2}px`,
      },
    };
  }, [selectRef?.offsetWidth]);

  return (
    <Select
      {...props}
      open={open}
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
                <Box
                  sx={{ display: "flex", alignItems: "center", fontSize: 16 }}
                >
                  {icon}
                </Box>
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
          ...(open ? { background: "none !important" } : {}),
        },
      }}
      MenuProps={{
        PaperProps: paperProps,
        MenuListProps: {
          sx: {
            padding: 0,
            pb: 1,
          },
        },
      }}
      IconComponent={CaretDownIcon}
      sx={{
        [`.${inputBaseClasses.root}`]: {
          boxShadow: "none !important",
          [`& .${selectClasses.icon}`]: {
            fontSize: 13,
            color: ({ palette }) => palette.gray[40],
          },
        },
      }}
    >
      {Object.values(MODELS_BY_GROUP)
        .map(({ name: groupName, icon, models }) => [
          <ListSubheader key={groupName}>
            <Typography
              sx={{
                fontWeight: 500,
                fontSize: 12,
                lineHeight: 1.3,
                letterSpacing: "0.03em",
                textTransform: "uppercase",
                color: ({ palette }) => palette.gray[50],
                mb: 1,
                pt: 2,
                paddingBottom: 0,
              }}
            >
              {groupName}
            </Typography>
          </ListSubheader>,
          ...models.map(({ id, name, description }) => {
            const active = id === model;
            return (
              <MenuItem
                key={id}
                value={id}
                sx={{
                  display: "flex",
                  mb: 1,
                  gap: 1.5,
                  [`&.${menuItemClasses.selected}`]: {
                    background: "none",
                  },
                  [`&.${menuItemClasses.selected}:hover`]: {
                    background: "rgba(7, 117, 227, 0.08)",
                  },
                }}
              >
                <Box
                  className="menu-item-icon"
                  sx={({ palette }) => ({
                    paddingX: 1.125,
                    fontSize: 22,
                    color: active ? palette.blue[70] : palette.gray[50],
                    [`.${menuItemClasses.root}:hover &`]: {
                      color: palette.blue[50],
                    },
                  })}
                >
                  {active ? <CheckIcon /> : icon}
                </Box>

                <Box>
                  <Box display="flex" gap={1} alignItems="center">
                    <Typography
                      className="menu-item-name"
                      sx={({ palette }) => ({
                        fontWeight: 500,
                        fontSize: 14,
                        lineHeight: "18px",
                        color: active ? palette.blue[70] : palette.gray[90],
                        [`.${menuItemClasses.root}:hover &`]: {
                          color: palette.blue[50],
                        },
                      })}
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
                      sx={({ palette }) => ({
                        fontWeight: 500,
                        fontSize: 13,
                        lineHeight: "18px",
                        color: active ? palette.gray[70] : palette.gray[50],
                        [`.${menuItemClasses.root}:hover &`]: {
                          color: palette.gray[70],
                        },
                      })}
                    >
                      {id}
                    </Typography>
                  </Box>
                  <Typography
                    className="menu-item-description"
                    sx={({ palette }) => ({
                      fontWeight: 500,
                      fontSize: 13,
                      lineHeight: "18px",
                      color: active ? palette.common.black : palette.gray[70],
                      whiteSpace: "break-spaces",
                      [`.${menuItemClasses.root}:hover &`]: {
                        color: palette.common.black,
                      },
                    })}
                  >
                    {description}
                  </Typography>
                </Box>
              </MenuItem>
            );
          }),
        ])
        .flat()}
    </Select>
  );
};
