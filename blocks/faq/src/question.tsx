import {
  Button,
  EditableField,
  faTrash,
  FontAwesomeIcon,
} from "@hashintel/design-system";
import { Box, buttonClasses, Collapse, Fade } from "@mui/material";
import { FunctionComponent, useState } from "react";

import { answerKey, questionKey, QuestionOrAnswer } from "./app";
import { CaretDownIcon } from "./icons/caret-down";

interface QuestionProps {
  index: number;
  question?: string;
  answer?: string;
  deletable?: boolean;
  readonly?: boolean;
  displayNumber?: boolean;
  displayToggle?: boolean;
  updateField: (value: string, field: QuestionOrAnswer) => void;
  onRemove: () => void;
}

export const Question: FunctionComponent<QuestionProps> = ({
  index,
  question,
  answer,
  deletable = true,
  readonly,
  displayNumber = true,
  displayToggle = true,
  updateField,
  onRemove,
}) => {
  const [questionValue, setQuestionValue] = useState(question ?? "");
  const [answerValue, setAnswerValue] = useState(answer ?? "");
  const [expanded, setExpanded] = useState(true);

  return (
    <Box>
      <Box sx={{ display: "flex", alignItems: "center", gap: 1.5, mb: 1 }}>
        <Collapse in={!readonly && deletable}>
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
              Remove question
            </Button>
          </Fade>
        </Collapse>
      </Box>

      <Box display="flex" alignItems="flex-start">
        <Button
          variant="tertiary_quiet"
          onClick={() => setExpanded(!expanded)}
          sx={{
            minWidth: 0,
            minHeight: 0,
            paddingX: 0,
            paddingY: readonly ? 0.5 : 2.125,
            mr: displayNumber || displayToggle ? 1.5 : 0,
            background: "none !important",
            fontSize: 12,
            fontWeight: 700,
            lineHeight: "15px",
            color: ({ palette }) => palette.black,
            transition: ({ transitions }) => transitions.create("margin-right"),
            [`.${buttonClasses.endIcon}`]: {
              ml: 0.75,
            },
          }}
          endIcon={
            <Collapse in={displayToggle} orientation="horizontal">
              <CaretDownIcon
                sx={{
                  fontSize: 12,
                  color: ({ palette }) => palette.black,
                  transition: ({ transitions }) =>
                    transitions.create("transform"),
                  transform: `rotate(${expanded ? 0 : -90}deg)`,
                }}
              />
            </Collapse>
          }
        >
          <Collapse in={displayNumber} orientation="horizontal">
            {index}
          </Collapse>
        </Button>

        <Box
          sx={{
            flexGrow: 1,
            ...(!readonly
              ? {
                  border: ({ palette }) => `1px solid ${palette.gray[20]}`,
                  borderRadius: 2.5,
                  overflow: "hidden",
                }
              : {}),
          }}
        >
          <Box
            sx={{
              ...(!readonly
                ? {
                    paddingY: 2.125,
                    paddingX: 2.75,
                  }
                : {}),
            }}
          >
            <EditableField
              editIconFontSize={15}
              value={questionValue}
              onChange={(event) => {
                if (!readonly) {
                  setQuestionValue(event.target.value);
                }
              }}
              onBlur={(event) => updateField(event.target.value, questionKey)}
              sx={{
                fontWeight: 700,
                fontSize: 15,
                lineHeight: 1,
                color: ({ palette }) => palette.gray[90],
                ...(readonly ? { paddingY: 0.5 } : {}),
              }}
              placeholder="Your frequently asked question goes here"
              readonly={readonly}
            />
          </Box>

          <Collapse in={expanded}>
            <Box
              sx={{
                ...(!readonly
                  ? {
                      paddingY: 2.125,
                      paddingX: 2.75,
                      borderWidth: 0,
                      borderTopWidth: 1,
                      borderStyle: "solid",
                      borderColor: ({ palette }) => palette.gray[20],
                    }
                  : {}),
              }}
            >
              <EditableField
                editIconFontSize={14}
                value={answerValue}
                onChange={(event) => {
                  if (!readonly) {
                    setAnswerValue(event.target.value);
                  }
                }}
                onBlur={(event) => updateField(event.target.value, answerKey)}
                sx={{
                  fontWeight: 400,
                  fontSize: 14,
                  lineHeight: 1.3,
                  color: ({ palette }) => palette.gray[90],
                  ...(readonly ? { paddingY: 0.5 } : {}),
                }}
                placeholder="Provide your answer here"
                readonly={readonly}
              />
            </Box>
          </Collapse>
        </Box>
      </Box>
    </Box>
  );
};
