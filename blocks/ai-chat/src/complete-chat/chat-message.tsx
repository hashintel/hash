import { Box, Typography } from "@mui/material";
import { lowlight } from "lowlight";
import { Fragment, FunctionComponent, useMemo, useState } from "react";
import SyntaxHighlighter from "react-syntax-highlighter";
import { a11yDark } from "react-syntax-highlighter/dist/esm/styles/hljs";
import { TypeAnimation } from "react-type-animation";

import { AbstractAiIcon } from "../icons/abstract-ai";
import { UserIcon } from "../icons/user";
import { IncompleteOpenAiAssistantMessage, OpenAIChatMessage } from "./types";

type MessageContentBlock = {
  kind: "text" | "code";
  content: string;
};

const typeAnimationSpeed = 99;

const supportedLanguages = lowlight.listLanguages();

const codeLanguageRegex = /^\s*([\w-]+)/;

const CodeBlock: FunctionComponent<{ code: string }> = ({ code }) => {
  const language = useMemo(() => {
    const match = code.match(codeLanguageRegex);

    return match && match[0] && supportedLanguages.includes(match[0])
      ? match[0]
      : undefined;
  }, [code]);

  return (
    <SyntaxHighlighter language={language} style={a11yDark} showLineNumbers>
      {language ? code.replace(codeLanguageRegex, "").trim() : code}
    </SyntaxHighlighter>
  );
};

const AssistantMessageContent: FunctionComponent<{
  messageContent: string;
  onAnimationEnd: () => void;
}> = ({ messageContent, onAnimationEnd }) => {
  const blocks = useMemo<MessageContentBlock[]>(() => {
    const sanitizedMessageContent = messageContent.trim();

    const startsWithCodeBlock = sanitizedMessageContent.startsWith("```");

    return sanitizedMessageContent
      .split("```")
      .filter((content) => content !== "")
      .map((content, index) => ({
        kind: index % 2 === (startsWithCodeBlock ? 1 : 0) ? "text" : "code",
        content: content.trim(),
      }));
  }, [messageContent]);

  return (
    <Box sx={{ "& .type-animation": { whiteSpace: "pre-line" } }}>
      {blocks.map(({ kind, content }, index) => (
        // eslint-disable-next-line react/no-array-index-key
        <Fragment key={index}>
          {kind === "text" ? (
            <Typography>
              <TypeAnimation
                className="type-animation"
                sequence={[content, onAnimationEnd]}
                speed={typeAnimationSpeed}
              />
            </Typography>
          ) : (
            <CodeBlock code={content} />
          )}
        </Fragment>
      ))}
    </Box>
  );
};

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
          <AssistantMessageContent
            messageContent={message.content}
            onAnimationEnd={() => setShowCursor(false)}
          />
        ) : (
          <>
            <Typography>
              <TypeAnimation sequence={[]} speed={99} cursor={showCursor} />
            </Typography>
            <Typography sx={{ color: ({ palette }) => palette.gray[50] }}>
              Thinking...
            </Typography>
          </>
        )
      ) : (
        <Typography>{message.content}</Typography>
      )}
    </Box>
  );
};
