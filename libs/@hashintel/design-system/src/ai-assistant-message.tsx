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

import { CodeBlock } from "./ai-assistant-message/code-block";

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

export const AiAssistantMessage: FunctionComponent<{
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
