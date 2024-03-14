import { AiAssistantMessage } from "@hashintel/block-design-system";
import { Box, Typography } from "@mui/material";
import type { FunctionComponent } from "react";
import { TypeAnimation } from "react-type-animation";

import { AbstractAiIcon } from "../icons/abstract-ai";
import { UserIcon } from "../icons/user";
import type {
  IncompleteOpenAiAssistantMessage,
  OpenAIChatMessage,
} from "./types";

export const ChatMessage: FunctionComponent<{
  readonly: boolean;
  message: OpenAIChatMessage | IncompleteOpenAiAssistantMessage;
}> = ({ message, readonly }) => {
  return (
    <Box
      sx={{
        display: "flex",
        width: "100%",
        padding: ({ spacing }) => spacing(2, 3),
        backgroundColor: ({ palette }) =>
          message.role === "user" ? "transparent" : palette.gray[10],
        boxShadow:
          message.role === "user"
            ? "none"
            : "inset 0px -6px 14px rgba(187, 196, 219, 0.15)",
        borderBottomStyle: "solid",
        borderBottomColor: ({ palette }) => palette.gray[20],
        borderBottomWidth: 1,
      }}
    >
      <Box sx={{ marginRight: 2 }}>
        {message.role === "user" ? (
          <UserIcon sx={{ fontSize: 16, marginTop: "5px" }} />
        ) : (
          <AbstractAiIcon
            sx={{
              fontSize: 18,
              color: ({ palette }) => palette.gray[50],
              marginTop: "3px",
            }}
          />
        )}
      </Box>
      <Box flexGrow={1} minWidth={0}>
        {message.role === "assistant" ? (
          "content" in message ? (
            <AiAssistantMessage
              disableEntranceAnimation={readonly}
              messageContent={message.content}
            />
          ) : (
            <Box display="flex">
              <Typography>
                <TypeAnimation sequence={[]} cursor />
              </Typography>
              <Typography sx={{ color: ({ palette }) => palette.gray[50] }}>
                Thinking...
              </Typography>
            </Box>
          )
        ) : (
          <Typography>{message.content}</Typography>
        )}
      </Box>
    </Box>
  );
};
