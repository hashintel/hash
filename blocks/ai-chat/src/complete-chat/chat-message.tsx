import { Box, Typography } from "@mui/material";
import { FunctionComponent, useState } from "react";
import { TypeAnimation } from "react-type-animation";

import { AbstractAiIcon } from "../icons/abstract-ai";
import { UserIcon } from "../icons/user";
import { IncompleteOpenAiAssistantMessage, OpenAIChatMessage } from "./types";

export const ChatMessage: FunctionComponent<{
  message: OpenAIChatMessage | IncompleteOpenAiAssistantMessage;
}> = ({ message }) => {
  const [showCursor, setShowCursor] = useState(true);

  return (
    <Box
      display="flex"
      sx={{
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
        "& .type-animation::after": {
          display: showCursor ? undefined : "none",
        },
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
      {message.role === "assistant" ? (
        "content" in message ? (
          <TypeAnimation
            className="type-animation"
            sequence={[message.content, () => setShowCursor(false)]}
            speed={99}
          />
        ) : (
          <>
            <TypeAnimation sequence={[]} speed={99} cursor={showCursor} />
            <Typography sx={{ color: ({ palette }) => palette.gray[50] }}>
              Thinking...
            </Typography>
          </>
        )
      ) : (
        message.content
      )}
    </Box>
  );
};
