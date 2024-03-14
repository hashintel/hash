import { EditableField } from "@hashintel/block-design-system";
import { Button, faTrash, FontAwesomeIcon } from "@hashintel/design-system";
import { Box, Collapse, Fade } from "@mui/material";
import type { FunctionComponent } from "react";
import { useState } from "react";

import type { QuestionOrAnswer } from "./app";
import { answerKey, questionKey } from "./app";
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
    <Box display="flex" alignItems="flex-start">
      <Box display="flex">
        <Button
          variant="tertiary_quiet"
          onClick={() => setExpanded(!expanded)}
          sx={{
            border: "none",
            minWidth: 0,
            minHeight: 0,
            paddingX: 0,
            paddingY: readonly ? 0 : 2.435,
            mr: displayNumber || displayToggle ? 1.5 : 0,
            background: "none !important",
            fontSize: 12,
            fontWeight: 700,
            lineHeight: "15px",
            color: ({ palette }) => `${palette.black} !important`,
            transition: ({ transitions }) => transitions.create("margin-right"),
          }}
        >
          <Collapse in={displayNumber} orientation="horizontal">
            {index}
          </Collapse>
          <Collapse
            in={displayToggle}
            orientation="horizontal"
            sx={{ display: "flex" }}
          >
            <CaretDownIcon
              sx={{
                display: "flex",
                fontSize: 12,
                color: ({ palette }) => palette.black,
                transition: ({ transitions }) =>
                  transitions.create(["transform", "margin-left"]),
                transform: `rotate(${expanded ? 0 : -90}deg)`,
                ml: displayNumber ? 0.75 : 0,
              }}
            />
          </Collapse>
        </Button>
      </Box>

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
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  width: 1,
                  paddingY: 2.125,
                  paddingX: 2.75,
                  boxSizing: "border-box",
                }
              : {}),
          }}
        >
          <EditableField
            editIconFontSize={12}
            value={questionValue}
            onChange={(event) => {
              setQuestionValue(event.target.value);
            }}
            onBlur={(event) => updateField(event.target.value, questionKey)}
            sx={{
              fontWeight: 700,
              fontSize: 15,
              lineHeight: 1,
              flexGrow: 1,
              color: ({ palette }) => palette.gray[90],
            }}
            placeholder="Your frequently asked question goes here"
            readonly={readonly}
          />

          {!readonly ? (
            <Fade in={deletable}>
              <Button
                variant="tertiary"
                size="xs"
                sx={({ palette }) => ({
                  padding: 0.5,
                  minHeight: "unset",
                  minWidth: "unset",
                  background: "none !important",
                  borderWidth: 0,
                  borderRadius: 1.25,
                  color: palette.gray[70],
                  ":hover": {
                    color: palette.red[70],
                  },
                })}
                onClick={onRemove}
              >
                <FontAwesomeIcon
                  icon={{ icon: faTrash }}
                  sx={{ fontSize: 12 }}
                />
              </Button>
            </Fade>
          ) : null}
        </Box>

        <Collapse in={expanded || !displayToggle}>
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
              editIconFontSize={12}
              value={answerValue}
              onChange={(event) => {
                setAnswerValue(event.target.value);
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
  );
};
