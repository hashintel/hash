import { Button } from "@hashintel/design-system";
import {
  Box,
  buttonBaseClasses,
  inputBaseClasses,
  outlinedInputClasses,
  TextField,
} from "@mui/material";
import { FormEvent, FunctionComponent, useCallback, useState } from "react";

import { ArrowTurnDownLeftIcon } from "../icons/arrow-turn-down-left";

export const ChatTextField: FunctionComponent<{
  loading: boolean;
  chatHasStarted: boolean;
  submitMessageContent: (messageContent: string) => void;
}> = ({ submitMessageContent, chatHasStarted, loading }) => {
  const [inputValue, setInputValue] = useState<string>("");

  const handleSubmit = useCallback(
    (event: FormEvent) => {
      event.preventDefault();
      setInputValue("");
      submitMessageContent(inputValue);
    },
    [inputValue, submitMessageContent],
  );

  return (
    <Box
      component="form"
      onSubmit={handleSubmit}
      sx={{
        width: "100%",
        marginBottom: 0,
      }}
    >
      <TextField
        autoFocus
        multiline
        fullWidth
        value={inputValue}
        onChange={({ target }) => setInputValue(target.value)}
        onKeyDown={(event) => {
          const { shiftKey, code } = event;
          if (!shiftKey && code === "Enter") {
            handleSubmit(event);
          }
        }}
        placeholder={
          chatHasStarted ? "Enter a response" : "Begin a conversation"
        }
        required
        disabled={loading}
        sx={({ palette }) => ({
          width: 1,
          [`& .${inputBaseClasses.input}`]: {
            minHeight: "unset",
            fontSize: 16,
            lineHeight: "21px",
            paddingY: 2.125,
            paddingLeft: 2.75,
            paddingRight: 0,
          },
          [`& .${inputBaseClasses.disabled}`]: {
            background: palette.gray[10],
            color: palette.gray[70],
          },
          [`& .${outlinedInputClasses.notchedOutline}`]: {
            border: `1px solid ${palette.gray[20]}`,
          },
        })}
        InputProps={{
          endAdornment: (
            <Button
              type="submit"
              variant="tertiary_quiet"
              disabled={loading}
              sx={({ palette }) => ({
                alignSelf: "flex-end",
                fontSize: 13,
                fontWeight: 700,
                letterSpacing: "-0.02em",
                lineHeight: 1,
                color: palette.blue[70],
                textTransform: "uppercase",
                height: 55,
                width: 1,
                maxHeight: 55,
                maxWidth: 120,
                minHeight: 51,
                whiteSpace: "nowrap",
                [`&.${buttonBaseClasses.disabled}`]: {
                  color: palette.common.black,
                  background: "none",
                },
              })}
            >
              Submit{" "}
              <ArrowTurnDownLeftIcon
                sx={{
                  ml: 1,
                  fontSize: 12,
                }}
              />
            </Button>
          ),
        }}
      />
    </Box>
  );
};
