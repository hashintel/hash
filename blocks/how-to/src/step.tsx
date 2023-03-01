import { Button, faTrash, FontAwesomeIcon } from "@hashintel/design-system";
import { Box, Fade, SxProps, Theme, Typography } from "@mui/material";
import { FunctionComponent, useState } from "react";
import { descriptionKey, titleKey, TitleOrDescription } from "./app";
import { EditableField } from "./editable-field";

interface StepProps {
  header: string;
  headerSx?: SxProps<Theme>;
  title?: string;
  description?: string;
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
  description,
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
          value={titleValue}
          onChange={(event) => setTitleValue(event.target.value)}
          onBlur={(event) => updateField(event.target.value, titleKey)}
          height="15px"
          sx={{
            fontWeight: 700,
            fontSize: 15,
            lineHeight: 1,
            color: ({ palette }) => palette.gray[90],
            ...(readonly ? { paddingY: 0.5 } : {}),
          }}
          placeholder="Step name goes here"
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
          value={descriptionValue}
          onChange={(event) => setDescriptionValue(event.target.value)}
          onBlur={(event) => updateField(event.target.value, descriptionKey)}
          height="18px"
          sx={{
            fontWeight: 400,
            fontSize: 14,
            lineHeight: 1.3,
            color: ({ palette }) => palette.gray[90],
            ...(readonly ? { paddingY: 0.5 } : {}),
          }}
          placeholder="Detailed instructions associated with the step can be added here. Click to start typing."
          readonly={readonly}
        />
      </Box>
    </Box>
  );
};
