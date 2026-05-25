import { Collapsible } from "@ark-ui/react/collapsible";
import { useEffect, useState } from "react";
import ReactMarkdown from "react-markdown";

import { Icon } from "@hashintel/ds-components";
import { css, cva } from "@hashintel/ds-helpers/css";

import { collapsibleContentStyle } from "./shared/collapsible-content-style";
import { markdownStyle } from "./shared/markdown-style";
import { StreamingEllipsis } from "./shared/streaming-ellipsis";

import type { PetrinautReasoningMetadata } from "../types";
import type { ReasoningMessagePart } from "./get-message-render-items";

const reasoningGroupStyle = css({
  display: "flex",
  flexDirection: "column",
  gap: "3",
  borderRadius: "lg",
  backgroundColor: "neutral.bg.subtle",
  padding: "1",
});

const reasoningHeaderStyle = css({
  display: "flex",
  alignItems: "center",
  gap: "2",
  width: "full",
  height: "8",
  paddingX: "1",
  border: "none",
  borderRadius: "lg",
  backgroundColor: "[transparent]",
  color: "neutral.s90",
  cursor: "pointer",
  fontSize: "sm",
  fontWeight: "medium",
  textAlign: "left",
  _hover: {
    backgroundColor: "white.a60",
  },
  "& svg[data-chevron]": {
    transition: "[transform 150ms ease-out]",
  },
  "&[data-state=closed] svg[data-chevron]": {
    transform: "[rotate(180deg)]",
  },
});

const reasoningLabelGroupStyle = css({
  display: "flex",
  flex: "[1]",
  alignItems: "baseline",
  gap: "[6px]",
  minWidth: "[0]",
});

const reasoningHeadingStyle = css({
  flex: "[1]",
  minWidth: "[0]",
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
  color: "neutral.s80",
  fontWeight: "normal",
});

// The elapsed-time span sits between two flexible siblings; without an
// explicit `flex-shrink: 0` and `nowrap` it can collapse to zero width once
// the heading appears and consumes the label-group's `flex: 1` budget.
const reasoningElapsedStyle = css({
  flexShrink: "[0]",
  whiteSpace: "nowrap",
  fontVariantNumeric: "tabular-nums",
  color: "neutral.s80",
  fontWeight: "normal",
});

const reasoningBodyStyle = cva({
  base: {
    position: "relative",
    overflow: "hidden",
    borderWidth: "thin",
    borderStyle: "solid",
    borderColor: "neutral.a30",
    borderRadius: "md",
    backgroundColor: "neutral.s10",
    padding: "2",
    color: "neutral.s90",
    fontSize: "sm",
    fontWeight: "medium",
    lineHeight: "[1.5]",
  },
  variants: {
    streaming: {
      true: {
        // Subtle reflective sweep across the body so the user can see the
        // step is still in progress without watching the elapsed-time
        // counter. The gradient sits above the markdown content but is
        // mostly transparent, so the text underneath stays readable.
        _after: {
          content: '""',
          position: "absolute",
          inset: "0",
          borderRadius: "[inherit]",
          background:
            "[linear-gradient(110deg, transparent 35%, rgba(255,255,255,0.55) 50%, transparent 65%)]",
          backgroundSize: "[200% 100%]",
          animationName: "shimmer",
          animationDuration: "[2.4s]",
          animationTimingFunction: "linear",
          animationIterationCount: "[infinite]",
          pointerEvents: "none",
        },
      },
    },
  },
});

const reasoningLoadingStyle = css({
  display: "flex",
  alignItems: "center",
  gap: "2",
  minHeight: "6",
  color: "neutral.s80",
});

const formatElapsedTime = (elapsedMs: number): string => {
  const seconds = Math.max(0, Math.floor(elapsedMs / 1_000));
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;

  return minutes > 0
    ? `${minutes}m ${remainingSeconds.toString().padStart(2, "0")}s`
    : `${seconds}s`;
};

/**
 * Compute the elapsed time string for a reasoning step from server-provided
 * timestamps. Returns `undefined` when `startedAt` is missing — older messages
 * persisted before the server-side injector existed, or messages from a
 * provider that does not attach Petrinaut metadata, simply omit the timer
 * rather than fall back to a misleading client-side clock that resets on
 * panel close/reopen.
 */
const useReasoningElapsed = ({
  isStreaming,
  startedAt,
  finishedAt,
}: {
  isStreaming: boolean;
  startedAt?: number;
  finishedAt?: number;
}): string | undefined => {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!isStreaming || finishedAt != null || startedAt == null) {
      return;
    }
    const updateNow = () => setNow(Date.now());
    updateNow();
    const intervalId = window.setInterval(updateNow, 1_000);

    return () => window.clearInterval(intervalId);
  }, [isStreaming, finishedAt, startedAt]);

  if (startedAt == null) {
    return undefined;
  }

  const end = finishedAt ?? now;
  return formatElapsedTime(Math.max(0, end - startedAt));
};

/**
 * Pulls the bold heading off the front of an OpenAI reasoning-summary block.
 *
 * The current backend ([apps/petrinaut-website/api/chat.ts]) sets
 * `reasoningSummary: "auto"` for the OpenAI provider, which emits each summary
 * item as `**Heading**\n\n<body>`. This helper hoists the heading so the
 * collapsible card trigger can preview what the model is thinking about.
 *
 * If the convention is not matched (different provider, OpenAI changes the
 * format, or the model just produced an unheaded summary), we fall back to
 * returning the original text as the body and let the trigger render the
 * plain "Reasoning" label.
 */
const reasoningHeadingPattern =
  /^\s*(?:\*\*([^*\n]+?)\*\*|#+\s+([^\n]+))\s*(?:\n|$)/u;

export const extractReasoningHeading = (
  text: string,
  isStreaming: boolean,
): { heading?: string; body: string } => {
  const match = text.match(reasoningHeadingPattern);
  if (!match) {
    return { body: text };
  }
  // While the part is streaming, don't commit to a heading until the
  // terminating newline has arrived — otherwise the trigger label flickers
  // character-by-character as deltas come in.
  if (isStreaming && !match[0].includes("\n")) {
    return { body: text };
  }
  const heading = (match[1] ?? match[2])?.trim();
  if (!heading) {
    return { body: text };
  }
  return { heading, body: text.slice(match[0].length).trimStart() };
};

const getReasoningTiming = (
  part: ReasoningMessagePart,
): { startedAt?: number; finishedAt?: number } => {
  const metadata = part.providerMetadata as
    | PetrinautReasoningMetadata
    | undefined;
  return metadata?.petrinaut ?? {};
};

export const AiAssistantReasoning = ({
  isStreaming,
  part,
}: {
  isStreaming: boolean;
  part: ReasoningMessagePart;
}) => {
  const { startedAt, finishedAt } = getReasoningTiming(part);
  const elapsedTime = useReasoningElapsed({
    isStreaming,
    startedAt,
    finishedAt,
  });
  const renderedText = part.text.trim();
  const { heading, body } = extractReasoningHeading(renderedText, isStreaming);
  const [open, setOpen] = useState(isStreaming);

  useEffect(() => {
    setOpen(isStreaming);
  }, [isStreaming]);

  if (!isStreaming && !renderedText) {
    return null;
  }

  return (
    <Collapsible.Root
      className={reasoningGroupStyle}
      open={open}
      onOpenChange={(details) => setOpen(details.open)}
    >
      <Collapsible.Trigger className={reasoningHeaderStyle}>
        <Icon name="list" size="sm" />
        <span className={reasoningLabelGroupStyle}>
          <span>Reasoning</span>
          {heading && (
            <span className={reasoningHeadingStyle}>
              ({heading.toLowerCase()})
            </span>
          )}
        </span>
        {elapsedTime !== undefined && (
          <span
            className={reasoningElapsedStyle}
            aria-label={`Reasoning time ${elapsedTime}`}
          >
            {elapsedTime}
          </span>
        )}
        <Icon name="chevronUp" data-chevron size="sm" />
      </Collapsible.Trigger>
      <Collapsible.Content className={collapsibleContentStyle}>
        <div className={reasoningBodyStyle({ streaming: isStreaming })}>
          {body ? (
            <div className={markdownStyle}>
              <ReactMarkdown>{body}</ReactMarkdown>
            </div>
          ) : isStreaming ? (
            <div
              className={reasoningLoadingStyle}
              aria-label="Loading reasoning"
              data-testid="reasoning-loading"
            >
              <StreamingEllipsis />
            </div>
          ) : null}
        </div>
      </Collapsible.Content>
    </Collapsible.Root>
  );
};
