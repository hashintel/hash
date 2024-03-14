import { EditableField } from "@hashintel/block-design-system";
import { Button, faTrash, FontAwesomeIcon } from "@hashintel/design-system";
import type { SxProps, Theme } from "@mui/material";
import { Box, Fade, Typography } from "@mui/material";
import type { FunctionComponent } from "react";
import { useState } from "react";

import type { TitleOrDescription } from "./app";
import { descriptionKey, titleKey } from "./app";

interface StepProps {
  header: string;
  headerSx?: SxProps<Theme>;
  title?: string;
  titlePlaceholder?: string;
  description?: string;
  descriptionPlaceholder?: string;
  deletable?: boolean;
  readonly?: boolean;
  updateField: (value: string, field: TitleOrDescription) => void;
  onRemove: () => void;
  deleteButtonText: string;
}

export const Step: FunctionComponent<StepProps> = ({
  header,
  headerSx = {},
  title,
  titlePlaceholder,
  description,
  descriptionPlaceholder,
  deletable = true,
  readonly,
  updateField,
  onRemove,
  deleteButtonText,
}) => {
  const [titleValue, setTitleValue] = useState(title ?? "");
  const [descriptionValue, setDescriptionValue] = useState(description ?? "");

  return (
    <Box>
      <Box sx={{ display: "flex", alignItems: "center", gap: 1.5, mb: 1 }}>
        <Typography
          variant="regularTextLabels"
          sx={{
            fontWeight: 700,
            fontSize: 15,
            lineHeight: 1.2,
            color: ({ palette }) => palette.black,
            paddingY: 0.75,
            ...headerSx,
          }}
        >
          {header}
        </Typography>

        {!readonly ? (
          <Fade in={deletable}>
            <Button
              variant="tertiary"
              size="xs"
              sx={({ palette }) => ({
                paddingX: 1.25,
                paddingY: 0.75,
                fontSize: 13,
                height: 30,
                minHeight: "unset",
                minWidth: "unset",
                background: palette.gray[10],
                borderWidth: 0,
                borderRadius: 1.25,
                color: palette.gray[70],
                fontWeight: 500,
              })}
              onClick={onRemove}
            >
              <FontAwesomeIcon
                icon={{ icon: faTrash }}
                sx={{ fontSize: 12, mr: 1 }}
              />
              {deleteButtonText}
            </Button>
          </Fade>
        ) : null}
      </Box>

      <Box
        sx={{
          ...(!readonly
            ? {
                paddingY: 2.125,
                paddingX: 2.75,
                borderWidth: 1,
                borderBottomWidth: 0,
                borderStyle: "solid",
                borderColor: ({ palette }) => palette.gray[20],
                borderTopLeftRadius: 10,
                borderTopRightRadius: 10,
              }
            : {}),
        }}
      >
        <EditableField
          editIconFontSize={15}
          value={titleValue}
          onChange={(event) => {
            if (!readonly) {
              setTitleValue(event.target.value);
            }
          }}
          onBlur={(event) => updateField(event.target.value, titleKey)}
          sx={{
            fontWeight: 700,
            fontSize: 15,
            lineHeight: 1,
            color: ({ palette }) => palette.gray[90],
            ...(readonly ? { paddingY: 0.5 } : {}),
          }}
          placeholder={titlePlaceholder}
          readonly={readonly}
        />
      </Box>

      <Box
        sx={{
          ...(!readonly
            ? {
                paddingY: 2.125,
                paddingX: 2.75,
                borderWidth: 1,
                borderStyle: "solid",
                borderColor: ({ palette }) => palette.gray[20],
                borderBottomLeftRadius: 10,
                borderBottomRightRadius: 10,
              }
            : {}),
        }}
      >
        <EditableField
          editIconFontSize={14}
          value={descriptionValue}
          onChange={(event) => {
            if (!readonly) {
              setDescriptionValue(event.target.value);
            }
          }}
          onBlur={(event) => updateField(event.target.value, descriptionKey)}
          sx={{
            fontWeight: 400,
            fontSize: 14,
            lineHeight: 1.3,
            color: ({ palette }) => palette.gray[90],
            ...(readonly ? { paddingY: 0.5 } : {}),
          }}
          placeholder={descriptionPlaceholder}
          readonly={readonly}
        />
      </Box>
    </Box>
  );
};
