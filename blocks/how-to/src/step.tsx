import { Button, faTrash, FontAwesomeIcon } from "@hashintel/design-system";
import { Box, Fade, Typography, useTheme } from "@mui/material";
import { FunctionComponent } from "react";
import {
  descriptionKey,
  titleKey,
  TitleOrDescription,
  Step as IStep,
} from "./app";
import { EditableField } from "./editable-field";

interface StepProps {
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

        <Fade in={!readonly && deletable}>
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
            : { paddingY: 0.5 }),
        }}
      >
        <EditableField
          value={title}
          onChange={(event) => setField(event.target.value, "title")}
          onBlur={(event) => updateField(event.target.value, titleKey)}
          height="15px"
          sx={{
            fontWeight: 700,
            fontSize: 15,
            lineHeight: 1,
            color: palette.gray[90],
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
            : { paddingY: 0.5 }),
        }}
      >
        <EditableField
          value={description}
          onChange={(event) => setField(event.target.value, "description")}
          onBlur={(event) => updateField(event.target.value, descriptionKey)}
          height="18px"
          sx={{
            fontWeight: 400,
            fontSize: 14,
            lineHeight: 1.3,
            color: palette.gray[90],
          }}
          placeholder="Detailed instructions associated with the step can be added here. Click to start typing."
          readonly={readonly}
        />
      </Box>
    </Box>
  );
};
