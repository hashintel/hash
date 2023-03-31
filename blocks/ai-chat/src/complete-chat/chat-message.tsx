import { Box, Collapse, CollapseProps, Typography } from "@mui/material";
import {
  Fragment,
  FunctionComponent,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import { TypeAnimation } from "react-type-animation";

import { AbstractAiIcon } from "../icons/abstract-ai";
import { UserIcon } from "../icons/user";
import { CodeBlock } from "./code-block";
import { IncompleteOpenAiAssistantMessage, OpenAIChatMessage } from "./types";

type MessageContentBlock = {
  kind: "text" | "code";
  content: string;
};

const typeAnimationSpeed = 95;

const ExpandOnMount: FunctionComponent<CollapseProps> = ({
  children,
  ...remainingProps
}) => {
  const [rendered, setRendered] = useState(false);

  useEffect(() => {
    setRendered(true);
  }, []);

  return (
    <Collapse in={rendered} {...remainingProps}>
      {children}
    </Collapse>
  );
};

const TextBlockTypeAnimation: FunctionComponent<{
  text: string;
  onAnimationEnd: () => void;
}> = ({ text, onAnimationEnd }) => {
  const [showCursor, setShowCursor] = useState(true);
  const handleAnimationEnd = useCallback(() => {
    setShowCursor(false);
    onAnimationEnd();
  }, [onAnimationEnd]);

  return (
    <Typography
      sx={{
        "& .type-animation::after": {
          display: showCursor ? undefined : "none",
        },
      }}
    >
      <TypeAnimation
        className="type-animation"
        sequence={[text, handleAnimationEnd]}
        speed={typeAnimationSpeed}
      />
    </Typography>
  );
};

const AssistantMessageContent: FunctionComponent<{
  messageContent: string;
}> = ({ messageContent }) => {
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

  const [displayedBlocks, setDisplayedBlocks] = useState<MessageContentBlock[]>(
    blocks.slice(0, 1),
  );

  useEffect(() => {
    setDisplayedBlocks(blocks.slice(0, 1));
  }, [blocks]);

  return (
    <Box sx={{ "& .type-animation": { whiteSpace: "pre-line" } }}>
      {displayedBlocks.map(({ kind, content }, index) => {
        const onAnimationEnd = () => {
          if (blocks.length > index + 1) {
            setDisplayedBlocks((prev) => [...prev, blocks[index + 1]!]);
          }
        };

        return (
          // eslint-disable-next-line react/no-array-index-key
          <Fragment key={index}>
            {kind === "text" ? (
              <TextBlockTypeAnimation
                text={content}
                onAnimationEnd={onAnimationEnd}
              />
            ) : (
              <ExpandOnMount onAnimationEnd={onAnimationEnd}>
                <CodeBlock code={content} />
              </ExpandOnMount>
            )}
          </Fragment>
        );
      })}
    </Box>
  );
};

export const ChatMessage: FunctionComponent<{
  message: OpenAIChatMessage | IncompleteOpenAiAssistantMessage;
}> = ({ message }) => {
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
          <AssistantMessageContent messageContent={message.content} />
        ) : (
          <>
            <Typography>
              <TypeAnimation sequence={[]} cursor />
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
