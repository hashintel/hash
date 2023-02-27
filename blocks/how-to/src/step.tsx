import { Button, faTrash, FontAwesomeIcon } from "@hashintel/design-system";
import { Box, Fade, Typography, useTheme } from "@mui/material";
import { FunctionComponent, useState } from "react";
import {
  descriptionKey,
  titleKey,
  TitleOrDescription,
  Step as IStep,
} from "./app";
import { EditableField } from "./editable-field";
// import { RichTextEditableField } from "./rich-text-editable-field";

interface StepProps {
  entityId: string;
  header: string;
  title?: string;
  description?: string;
  deletable?: boolean;
  readonly?: boolean;
  setField: (title: string, field: keyof IStep) => void;
  updateField: (value: string, field: TitleOrDescription) => void;
  onRemove: () => void;
  deleteButtonText: string;
}

export const Step: FunctionComponent<StepProps> = ({
  entityId,
  header,
  title,
  description,
  deletable = true,
  readonly,
  setField,
  updateField,
  onRemove,
  deleteButtonText,
}) => {
  const { palette } = useTheme();

  const [titleValue, setTitleValue] = useState(title ?? "");

  return (
    <Box>
      <Box sx={{ display: "flex", alignItems: "center", gap: 1.5, mb: 1 }}>
        <Typography
          variant="regularTextLabels"
          sx={{
            fontWeight: 700,
            fontSize: 15,
            lineHeight: 1.2,
            color: palette.black,
            paddingY: 0.75,
          }}
        >
          {header}
        </Typography>

        {!readonly ? (
          <Fade in={deletable}>
            <Button
              variant="tertiary"
              size="xs"
              sx={{
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
              }}
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
                borderColor: palette.gray[20],
                borderTopLeftRadius: 10,
                borderTopRightRadius: 10,
              }
            : {}),
        }}
      >
        <EditableField
          defaultValue={title}
          value={titleValue}
          onChange={(event) => setTitleValue(event.target.value)}
          onBlur={(event) => updateField(event.target.value, titleKey)}
          height="15px"
          sx={{
            fontWeight: 700,
            fontSize: 15,
            lineHeight: 1,
            color: palette.gray[90],
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
                borderColor: palette.gray[20],
                borderBottomLeftRadius: 10,
                borderBottomRightRadius: 10,
              }
            : {}),
        }}
      >
        {/* <RichTextEditableField
          fieldKey={descriptionKey}
          entityId={entityId}
          value={description}
          sx={{
            fontSize: 14,
            lineHeight: 1.3,
            color: palette.gray[90],
            ...(readonly ? { paddingY: 0.5 } : {}),
          }}
          placeholder="Detailed instructions associated with the step can be added here. Click to start typing."
          readonly={readonly}
        /> */}
      </Box>
    </Box>
  );
};
