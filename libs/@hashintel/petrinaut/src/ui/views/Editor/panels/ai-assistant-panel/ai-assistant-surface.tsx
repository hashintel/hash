import { Collapsible } from "@ark-ui/react/collapsible";
import {
  type PointerEvent as ReactPointerEvent,
  useEffect,
  useRef,
  useState,
} from "react";
import ReactMarkdown from "react-markdown";

import { Icon, LoadingSpinner } from "@hashintel/ds-components";
import { css, cva } from "@hashintel/ds-helpers/css";
import {
  getLatestNetDefinitionToolName,
  getNetCompilationErrorsToolName,
  petrinautAiMutationTools,
  type SelectionItem,
} from "@hashintel/petrinaut-core";

import { AiAssistantIcon } from "../../../../components/ai-assistant-icon";
import { Button } from "../../../../components/button";
import { Input } from "../../../../components/input";
import { getInteractiveTool } from "./interactive-tools/registry";
import {
  type AiToolOutput,
  type AiToolTarget,
  type AiToolSummary,
  summarizePetrinautAiToolCall,
} from "./tool-summaries";

import type { InteractiveToolDefinition } from "./interactive-tools/types";
import type { PetrinautAiMessage } from "./types";

type AiAssistantStatus = "submitted" | "streaming" | "ready" | "error";

type ToolTone = "danger" | "info" | "neutral" | "success";

type ToolRenderItem = {
  id: string;
  state: string;
  summary: AiToolSummary;
  tone: ToolTone;
  toolName: string;
  /** Set when the tool requires an inline widget for human input. */
  interactive?: {
    definition: InteractiveToolDefinition<unknown, AiToolOutput>;
    input: unknown;
    submittedOutput?: AiToolOutput;
  };
};

type MessagePart = PetrinautAiMessage["parts"][number];
type TextPart = Extract<MessagePart, { type: "text" }>;
type ReasoningMessagePart = Extract<MessagePart, { type: "reasoning" }>;

type RenderableToolPart = PetrinautAiMessage["parts"][number] & {
  input?: unknown;
  output?: unknown;
  state?: string;
  toolCallId?: string;
  toolName?: unknown;
  type: `tool-${string}` | "dynamic-tool";
};

type MessageRenderItem =
  | { type: "reasoning"; key: string; part: ReasoningMessagePart }
  | { type: "text"; key: string; part: TextPart }
  | { type: "tools"; key: string; tools: ToolRenderItem[] };

export type AiAssistantSurfaceProps = {
  error?: Error;
  input: string;
  messages: PetrinautAiMessage[];
  onClearMessages?: () => void;
  onClose: () => void;
  onInputChange: (value: string) => void;
  onInteractiveToolSubmit?: (params: {
    toolCallId: string;
    toolName: string;
    output: AiToolOutput;
  }) => void;
  onSelectToolTarget?: (target: AiToolTarget) => void;
  onStop: () => void;
  onSubmit: () => void;
  rightOffset?: number;
  status: AiAssistantStatus;
};

const shellStyle = css({
  position: "absolute",
  top: "0",
  right: "0",
  bottom: "0",
  width: "[420px]",
  maxWidth: "[calc(100vw - 32px)]",
  zIndex: 1090,
  padding: "2",
  pointerEvents: "auto",
  transition: "[right 150ms ease-in-out]",
  _before: {
    content: '""',
    position: "absolute",
    inset: "2",
    borderRadius: "[14px]",
    background:
      "[radial-gradient(circle at 78% 28%, rgba(52,160,250,0.22), rgba(190,230,255,0.04) 54%, transparent 80%)]",
    filter: "[blur(4px)]",
    pointerEvents: "none",
  },
});

const resizeHandleStyle = css({
  position: "absolute",
  top: "2",
  bottom: "2",
  left: "0",
  width: "[10px]",
  cursor: "ew-resize",
  zIndex: 1,
  touchAction: "none",
  _before: {
    content: '""',
    position: "absolute",
    top: "[12px]",
    bottom: "[12px]",
    left: "[4px]",
    width: "[2px]",
    borderRadius: "full",
    backgroundColor: "[transparent]",
    transition: "[background-color 120ms ease-out]",
  },
  _hover: {
    _before: {
      backgroundColor: "neutral.a40",
    },
  },
});

const cardStyle = css({
  position: "relative",
  display: "flex",
  flexDirection: "column",
  height: "full",
  overflow: "hidden",
  backgroundColor: "neutral.s10",
  borderRadius: "[12px]",
  boxShadow:
    "[0px 0px 0px 1px rgba(0,0,0,0.06), 0px 1px 1px -0.5px rgba(0,0,0,0.04), 0px 12px 12px -6px rgba(0,0,0,0.02), 0px 4px 4px -12px rgba(0,0,0,0.02)]",
});

const headerStyle = css({
  display: "flex",
  alignItems: "center",
  gap: "[1px]",
  paddingX: "1",
  paddingTop: "[6px]",
  borderBottom: "[1px solid rgba(0,0,0,0.08)]",
  flexShrink: 0,
});

const tabStyle = cva({
  base: {
    display: "flex",
    alignItems: "center",
    height: "[28px]",
    maxWidth: "[112px]",
    paddingX: "3",
    borderTopLeftRadius: "lg",
    borderTopRightRadius: "lg",
    fontSize: "xs",
    fontWeight: "medium",
    lineHeight: "[12px]",
    color: "neutral.s90",
    overflow: "hidden",
    whiteSpace: "nowrap",
    textOverflow: "ellipsis",
  },
  variants: {
    active: {
      true: {
        backgroundColor: "neutral.s00",
        boxShadow: "[0px 0px 0px 1px rgba(0,0,0,0.08)]",
        color: "neutral.s100",
      },
    },
  },
});

const headerButtonStyle = css({
  color: "neutral.s90",
  _hover: {
    color: "neutral.s110",
  },
});

const messagesStyle = css({
  display: "flex",
  flexDirection: "column",
  gap: "3",
  flex: "[1]",
  minHeight: "[0]",
  overflowY: "auto",
  padding: "2",
});

const emptyStyle = css({
  display: "flex",
  flex: "[1]",
  flexDirection: "column",
  alignItems: "center",
  justifyContent: "center",
  gap: "2",
  minHeight: "[240px]",
  color: "neutral.s90",
  textAlign: "center",
  fontSize: "sm",
  fontWeight: "medium",
  lineHeight: "[20px]",
  padding: "[20px]",
});

const messageStyle = cva({
  base: {
    display: "flex",
    flexDirection: "column",
    gap: "2",
    borderRadius: "xl",
    padding: "[10px]",
    fontSize: "sm",
    fontWeight: "medium",
    lineHeight: "[1.5]",
    color: "neutral.s100",
    boxShadow:
      "[0px 0px 0px 1px rgba(0,0,0,0.07), 0px 1px 1px -0.5px rgba(0,0,0,0.04), 0px 8px 8px -6px rgba(0,0,0,0.04)]",
  },
  variants: {
    role: {
      assistant: {
        alignSelf: "stretch",
        backgroundColor: "white.a95",
      },
      user: {
        alignSelf: "flex-end",
        maxWidth: "[92%]",
        backgroundColor: "neutral.s20",
        textAlign: "right",
      },
    },
    activity: {
      active: {},
      complete: {},
    },
  },
  compoundVariants: [
    {
      role: "assistant",
      activity: "active",
      css: {
        backgroundColor: "neutral.s00",
      },
    },
    {
      role: "assistant",
      activity: "complete",
      css: {
        backgroundColor: "neutral.s10",
      },
    },
  ],
});

const markdownStyle = css({
  overflowWrap: "anywhere",
  wordBreak: "break-word",
  "& > :first-child": {
    marginTop: "[0]",
  },
  "& > :last-child": {
    marginBottom: "[0]",
  },
  "& p": {
    marginY: "2",
  },
  "& h1, & h2, & h3, & h4, & h5, & h6": {
    marginTop: "3",
    marginBottom: "1",
    fontWeight: "semibold",
    lineHeight: "[1.25]",
    color: "neutral.s110",
  },
  "& h1": {
    fontSize: "[15px]",
  },
  "& h2, & h3": {
    fontSize: "sm",
  },
  "& h4, & h5, & h6": {
    fontSize: "xs",
  },
  "& ul, & ol": {
    marginY: "2",
    paddingLeft: "5",
  },
  "& ul": {
    listStyleType: "disc",
  },
  "& ol": {
    listStyleType: "decimal",
  },
  "& li": {
    marginY: "1",
  },
  "& li > p": {
    marginY: "1",
  },
  "& a": {
    color: "blue.s90",
    textDecorationLine: "underline",
    textUnderlineOffset: "[2px]",
  },
  "& blockquote": {
    marginY: "2",
    marginX: "[0]",
    borderLeftWidth: "[3px]",
    borderLeftStyle: "solid",
    borderLeftColor: "neutral.a40",
    paddingLeft: "3",
    color: "neutral.s90",
  },
  "& pre": {
    marginY: "2",
    overflowX: "auto",
    borderWidth: "thin",
    borderStyle: "solid",
    borderColor: "neutral.a30",
    borderRadius: "md",
    backgroundColor: "neutral.s20",
    padding: "2",
  },
  "& :not(pre) > code": {
    fontFamily: "mono",
    fontSize: "xs",
    backgroundColor: "neutral.s20",
    borderRadius: "sm",
    paddingX: "1",
  },
  "& pre code": {
    display: "block",
    minWidth: "[max-content]",
    backgroundColor: "[transparent]",
    padding: "[0]",
    fontFamily: "mono",
    fontSize: "xs",
    lineHeight: "[1.5]",
  },
  "& hr": {
    marginY: "3",
    borderWidth: "[0]",
    borderTopWidth: "thin",
    borderTopStyle: "solid",
    borderTopColor: "neutral.a30",
  },
});

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
  paddingX: "2",
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

const reasoningBodyStyle = css({
  borderWidth: "thin",
  borderStyle: "solid",
  borderColor: "neutral.a30",
  borderRadius: "lg",
  backgroundColor: "neutral.s10",
  boxShadow: "[0px 0px 0px 2px {colors.neutral.bg.subtle}]",
  padding: "2",
  color: "neutral.s90",
  fontSize: "sm",
  fontWeight: "medium",
  lineHeight: "[1.5]",
});

const collapsibleContentStyle = css({
  overflow: "hidden",
  animationDuration: "[200ms]",
  animationTimingFunction: "ease-in-out",
  "&[data-state=open]": {
    animationName: "expand",
  },
  "&[data-state=closed]": {
    animationName: "collapse",
  },
});

const reasoningLoadingStyle = css({
  display: "flex",
  alignItems: "center",
  gap: "2",
  minHeight: "6",
  color: "neutral.s80",
});

const toolListStyle = cva({
  base: {
    display: "flex",
    flexDirection: "column",
    borderRadius: "lg",
  },
  variants: {
    kind: {
      group: {
        backgroundColor: "[#eff9ff]",
        borderWidth: "thin",
        borderStyle: "solid",
        borderColor: "[#bee6ff]",
      },
      single: {},
    },
  },
});

const toolGroupPanelStyle = css({
  display: "flex",
  flexDirection: "column",
  gap: "[0]",
  overflow: "hidden",
  borderWidth: "thin",
  borderStyle: "solid",
  borderColor: "[rgba(0,0,0,0.13)]",
  borderRadius: "lg",
  backgroundColor: "white",
  "& > button": {
    borderRadius: "[0]",
  },
  "& > div > button": {
    borderRadius: "[0]",
  },
  "& > button:first-child": {
    borderTopLeftRadius: "md",
    borderTopRightRadius: "md",
  },
  "& > div:first-child > button": {
    borderTopLeftRadius: "md",
    borderTopRightRadius: "md",
  },
  "& > button:last-child": {
    borderBottomLeftRadius: "md",
    borderBottomRightRadius: "md",
  },
  "& > div:last-child > button": {
    borderBottomLeftRadius: "md",
    borderBottomRightRadius: "md",
  },
  "& > * + *": {
    marginTop: "[-1px]",
  },
});

const toolItemCollapsibleStyle = css({
  "& > button": {
    borderRadius: "[0]",
  },
});

const toolHeaderStyle = css({
  display: "flex",
  alignItems: "center",
  gap: "2",
  height: "8",
  paddingX: "2",
  fontSize: "sm",
  fontWeight: "medium",
  color: "[#0666c6]",
  "& svg[data-chevron]": {
    transition: "[transform 150ms ease-out]",
  },
  "&[data-state=closed] svg[data-chevron]": {
    transform: "[rotate(180deg)]",
  },
});

const toolHeaderIconStyle = css({
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  width: "[14px]",
  height: "[14px]",
  borderRadius: "full",
  backgroundColor: "[#2a80c8]",
  color: "white",
  boxShadow: "[0px 0px 0px 1px white]",
  flexShrink: 0,
});

const toolItemStyle = cva({
  base: {
    display: "flex",
    alignItems: "center",
    gap: "2",
    width: "full",
    minHeight: "8",
    paddingX: "2",
    paddingY: "[5px]",
    borderWidth: "thin",
    borderStyle: "solid",
    borderRadius: "lg",
    color: "neutral.s90",
    fontSize: "sm",
    fontWeight: "medium",
    textAlign: "left",
    cursor: "default",
    _enabled: {
      cursor: "pointer",
    },
    "& svg[data-chevron]": {
      transition: "[transform 150ms ease-out]",
    },
    "&[data-state=closed] svg[data-chevron]": {
      transform: "[rotate(180deg)]",
    },
  },
  variants: {
    tone: {
      danger: {
        backgroundColor: "red.s20",
        borderColor: "red.a40",
      },
      info: {
        backgroundColor: "[#eff9ff]",
        borderColor: "[#bee6ff]",
        color: "[#0666c6]",
      },
      neutral: {
        backgroundColor: "neutral.s10",
        borderColor: "neutral.a30",
      },
      success: {
        backgroundColor: "green.s20",
        borderColor: "green.a40",
      },
    },
  },
});

const toolStatusStyle = cva({
  base: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    width: "[14px]",
    height: "[14px]",
    borderRadius: "full",
    flexShrink: 0,
    boxShadow: "[0px 0px 0px 1px white]",
    color: "white",
  },
  variants: {
    tone: {
      danger: {
        backgroundColor: "red.s90",
      },
      info: {
        backgroundColor: "[#2a80c8]",
      },
      neutral: {
        backgroundColor: "neutral.s90",
      },
      success: {
        backgroundColor: "green.s90",
      },
    },
    state: {
      active: {
        backgroundColor: "white",
        borderWidth: "thin",
        borderStyle: "dashed",
        borderColor: "blue.s70",
        color: "blue.s70",
      },
      complete: {},
      error: {
        backgroundColor: "red.s90",
      },
    },
  },
});

const toolTextStyle = css({
  display: "flex",
  flex: "[1]",
  flexDirection: "column",
  gap: "[2px]",
});

const toolDetailStyle = css({
  display: "block",
  color: "neutral.s80",
  fontSize: "xs",
  lineHeight: "[16px]",
});

const toolSubItemListStyle = css({
  display: "flex",
  flexDirection: "column",
  gap: "1",
  padding: "[4px 8px 8px 30px]",
  color: "neutral.s80",
  fontSize: "xs",
  fontWeight: "medium",
  lineHeight: "[16px]",
});

const toolSubItemStyle = css({
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
});

const errorStyle = css({
  borderRadius: "lg",
  padding: "2",
  backgroundColor: "red.bg.subtle",
  color: "red.s100",
  fontSize: "sm",
  fontWeight: "medium",
});

const composerWrapStyle = css({
  padding: "2",
  backgroundColor: "neutral.bg.subtle",
  flexShrink: 0,
});

const composerStyle = css({
  display: "flex",
  alignItems: "center",
  gap: "1",
  borderRadius: "lg",
  backgroundColor: "neutral.s10",
  boxShadow:
    "[0px 0px 0px 1px rgba(0,0,0,0.06), 0px 1px 1px -0.5px rgba(0,0,0,0.04), 0px 12px 12px -6px rgba(0,0,0,0.02), 0px 4px 4px -12px rgba(0,0,0,0.02)]",
  padding: "1",
});

const inputStyle = css({
  flex: "[1]",
  minWidth: "[0]",
  width: "auto",
  borderColor: "[transparent]",
  backgroundColor: "[transparent]",
  boxShadow: "[none]",
  _hover: {
    borderColor: "[transparent]",
  },
  _focus: {
    borderColor: "[transparent]",
    boxShadow: "[none]",
  },
  _active: {
    borderColor: "[transparent]",
    boxShadow: "[none]",
  },
  _placeholder: {
    color: "neutral.s70",
  },
});

const isToolPart = (
  part: PetrinautAiMessage["parts"][number],
): part is RenderableToolPart =>
  part.type === "dynamic-tool" || part.type.startsWith("tool-");

const getToolName = (part: RenderableToolPart) =>
  part.type === "dynamic-tool" && typeof part.toolName === "string"
    ? part.toolName
    : part.type.replace(/^tool-/, "");

const getAiToolTarget = (value: unknown): AiToolTarget | undefined => {
  if (typeof value !== "object" || value === null) {
    return undefined;
  }

  const candidate = value as {
    id?: unknown;
    item?: unknown;
    itemId?: unknown;
    kind?: unknown;
    mode?: unknown;
    type?: unknown;
  };

  if (candidate.kind === "selection") {
    return { kind: "selection", item: candidate.item as SelectionItem };
  }

  if (
    candidate.kind === "simulateView" &&
    (candidate.mode === "scenarios" || candidate.mode === "metrics")
  ) {
    return {
      kind: "simulateView",
      mode: candidate.mode,
      itemId:
        typeof candidate.itemId === "string" ? candidate.itemId : undefined,
    };
  }

  if (typeof candidate.type === "string" && typeof candidate.id === "string") {
    return {
      kind: "selection",
      item: {
        type: candidate.type as SelectionItem["type"],
        id: candidate.id,
      },
    };
  }

  return undefined;
};

const getToolSummaryFromPart = (part: RenderableToolPart): AiToolSummary => {
  const toolName = getToolName(part);
  if (toolName === getLatestNetDefinitionToolName) {
    return { title: "Checked latest net definition" };
  }
  if (toolName === getNetCompilationErrorsToolName) {
    return { title: "Checked net compilation errors" };
  }

  const output = part.output;
  if (typeof output === "object" && output !== null) {
    const maybeSummary = output as {
      detail?: unknown;
      items?: unknown;
      title?: unknown;
      target?: unknown;
    };
    if (typeof maybeSummary.title === "string") {
      return {
        title: maybeSummary.title,
        detail:
          typeof maybeSummary.detail === "string"
            ? maybeSummary.detail
            : undefined,
        items: Array.isArray(maybeSummary.items)
          ? maybeSummary.items.filter(
              (item): item is string => typeof item === "string",
            )
          : undefined,
        target: getAiToolTarget(maybeSummary.target),
      };
    }
  }

  if (!(toolName in petrinautAiMutationTools)) {
    return { title: toolName };
  }
  try {
    return summarizePetrinautAiToolCall({
      toolName: toolName as never,
      input: part.input as never,
    });
  } catch {
    return { title: toolName };
  }
};

const getToolTone = ({
  state,
  summary,
  toolName,
}: {
  state: string;
  summary: AiToolSummary;
  toolName: string;
}): ToolTone => {
  if (state === "output-error") {
    return "danger";
  }

  if (
    toolName === getLatestNetDefinitionToolName ||
    toolName === getNetCompilationErrorsToolName
  ) {
    return "neutral";
  }

  if (
    toolName === "deleteItemsByIds" ||
    toolName.startsWith("remove") ||
    /^(Deleted|Removed)\b/u.test(summary.title)
  ) {
    return "danger";
  }

  return "success";
};

const toToolRenderItem = (
  message: PetrinautAiMessage,
  part: RenderableToolPart,
): ToolRenderItem => {
  const state = part.state ?? "input-available";
  const summary = getToolSummaryFromPart(part);
  const toolName = getToolName(part);

  const interactiveDefinition = getInteractiveTool(toolName, part.input);
  const interactive = interactiveDefinition
    ? {
        definition: interactiveDefinition,
        input: part.input,
        submittedOutput:
          state === "output-available" && part.output
            ? (part.output as AiToolOutput)
            : undefined,
      }
    : undefined;

  return {
    id:
      typeof part.toolCallId === "string"
        ? part.toolCallId
        : `${message.id}-${part.type}`,
    state,
    summary,
    tone: getToolTone({ state, summary, toolName }),
    toolName,
    interactive,
  };
};

const getMessageRenderItems = (
  message: PetrinautAiMessage,
): MessageRenderItem[] => {
  const items: MessageRenderItem[] = [];
  let pendingTools: ToolRenderItem[] = [];

  const flushTools = () => {
    if (pendingTools.length === 0) {
      return;
    }

    items.push({
      type: "tools",
      key: `${message.id}-tools-${items.length}`,
      tools: pendingTools,
    });
    pendingTools = [];
  };

  message.parts.forEach((part, index) => {
    if (part.type === "text") {
      flushTools();
      items.push({
        type: "text",
        key: `${message.id}-text-${index}`,
        part,
      });
      return;
    }

    if (part.type === "reasoning") {
      flushTools();
      items.push({
        type: "reasoning",
        key: `${message.id}-reasoning-${index}`,
        part,
      });
      return;
    }

    if (isToolPart(part)) {
      const tool = toToolRenderItem(message, part);

      if (
        tool.toolName === getLatestNetDefinitionToolName ||
        tool.toolName === getNetCompilationErrorsToolName
      ) {
        flushTools();
        pendingTools.push(tool);
        flushTools();
        return;
      }

      pendingTools.push(tool);
    }
  });

  flushTools();

  return items;
};

const isPartActive = (part: PetrinautAiMessage["parts"][number]): boolean =>
  "state" in part &&
  (part.state === "streaming" ||
    part.state === "input-streaming" ||
    part.state === "input-available");

const getMessagesScrollKey = (messages: PetrinautAiMessage[]): string =>
  messages
    .map((message) =>
      [
        message.id,
        message.parts
          .map((part) => {
            if (part.type === "text" || part.type === "reasoning") {
              return `${part.type}:${part.state ?? ""}:${part.text}`;
            }

            return "state" in part
              ? `${part.type}:${part.state ?? ""}`
              : part.type;
          })
          .join(","),
      ].join(":"),
    )
    .join("|");

const formatElapsedTime = (elapsedMs: number): string => {
  const seconds = Math.max(0, Math.floor(elapsedMs / 1_000));
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;

  return minutes > 0
    ? `${minutes}m ${remainingSeconds.toString().padStart(2, "0")}s`
    : `${seconds}s`;
};

const useElapsedTime = (isRunning: boolean): string => {
  const startedAtRef = useRef<number | null>(null);
  const [elapsedMs, setElapsedMs] = useState(0);

  useEffect(() => {
    startedAtRef.current ??= Date.now();
    const startedAt = startedAtRef.current;

    if (!isRunning) {
      setElapsedMs((current) => current || Date.now() - startedAt);
      return;
    }

    const updateElapsed = () => setElapsedMs(Date.now() - startedAt);
    updateElapsed();
    const intervalId = window.setInterval(updateElapsed, 1_000);

    return () => window.clearInterval(intervalId);
  }, [isRunning]);

  return formatElapsedTime(elapsedMs);
};

const ReasoningPart = ({
  isStreaming,
  text,
}: {
  isStreaming: boolean;
  text: string;
}) => {
  const elapsedTime = useElapsedTime(isStreaming);
  const renderedText = text.trim();
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
        <span style={{ flex: 1 }}>Reasoning</span>
        <span aria-label={`Reasoning time ${elapsedTime}`}>{elapsedTime}</span>
        <Icon name="chevronUp" data-chevron size="sm" />
      </Collapsible.Trigger>
      <Collapsible.Content className={collapsibleContentStyle}>
        <div className={reasoningBodyStyle}>
          {renderedText ? (
            <div className={markdownStyle}>
              <ReactMarkdown>{renderedText}</ReactMarkdown>
            </div>
          ) : (
            <output
              className={reasoningLoadingStyle}
              aria-label="Loading reasoning"
            >
              <LoadingSpinner data-testid="reasoning-spinner" size="xs" />
            </output>
          )}
        </div>
      </Collapsible.Content>
    </Collapsible.Root>
  );
};

const ToolItem = ({
  onInteractiveToolSubmit,
  onSelectToolTarget,
  tool,
}: {
  onInteractiveToolSubmit?: AiAssistantSurfaceProps["onInteractiveToolSubmit"];
  onSelectToolTarget?: (target: AiToolTarget) => void;
  tool: ToolRenderItem;
}) => {
  if (tool.interactive) {
    const { definition, input, submittedOutput } = tool.interactive;
    const submitted = tool.state === "output-available";
    const Widget = definition.Widget;
    let typedInput: unknown;
    try {
      typedInput = definition.parseInput(input);
    } catch {
      typedInput = input;
    }
    return (
      <Widget
        input={typedInput}
        submit={(output) => {
          onInteractiveToolSubmit?.({
            toolCallId: tool.id,
            toolName: tool.toolName,
            output,
          });
        }}
        state={submitted ? "submitted" : "awaiting"}
        submittedOutput={submittedOutput}
      />
    );
  }

  const complete = tool.state === "output-available";
  const errored = tool.state === "output-error";
  const target = tool.summary.target;
  const children = tool.summary.items ?? [];
  const expandable = children.length > 0;
  const title = errored ? `${tool.toolName} errored` : tool.summary.title;

  const button = (
    <button
      type="button"
      className={toolItemStyle({ tone: tool.tone })}
      data-tone={tool.tone}
      disabled={!target && !expandable}
      onClick={() => {
        if (target) {
          onSelectToolTarget?.(target);
        }
      }}
    >
      <span
        className={toolStatusStyle({
          state: errored ? "error" : complete ? "complete" : "active",
          tone: tool.tone,
        })}
      >
        {errored ? (
          <Icon name="close" size="xs" />
        ) : complete ? (
          <Icon name="check" size="xs" />
        ) : null}
      </span>
      <span className={toolTextStyle}>
        <span>{title}</span>
        {tool.summary.detail && (
          <span className={toolDetailStyle} data-testid="tool-detail">
            {tool.summary.detail}
          </span>
        )}
      </span>
      {expandable && <Icon name="chevronUp" data-chevron size="sm" />}
    </button>
  );

  if (!expandable) {
    return button;
  }

  return (
    <Collapsible.Root className={toolItemCollapsibleStyle} defaultOpen={false}>
      <Collapsible.Trigger asChild>{button}</Collapsible.Trigger>
      <Collapsible.Content className={collapsibleContentStyle}>
        <div className={toolSubItemListStyle}>
          {children.map((item, index) => (
            // oxlint-disable-next-line react/no-array-index-key
            <div className={toolSubItemStyle} key={`${tool.id}-${index}`}>
              {item}
            </div>
          ))}
        </div>
      </Collapsible.Content>
    </Collapsible.Root>
  );
};

const ToolListContent = ({
  onInteractiveToolSubmit,
  onSelectToolTarget,
  tools,
}: {
  onInteractiveToolSubmit?: AiAssistantSurfaceProps["onInteractiveToolSubmit"];
  onSelectToolTarget?: (target: AiToolTarget) => void;
  tools: ToolRenderItem[];
}) => (
  <>
    {tools.map((tool) => (
      <ToolItem
        key={tool.id}
        tool={tool}
        onInteractiveToolSubmit={onInteractiveToolSubmit}
        onSelectToolTarget={onSelectToolTarget}
      />
    ))}
  </>
);

const ToolList = ({
  onInteractiveToolSubmit,
  onSelectToolTarget,
  tools,
}: {
  onInteractiveToolSubmit?: AiAssistantSurfaceProps["onInteractiveToolSubmit"];
  onSelectToolTarget?: (target: AiToolTarget) => void;
  tools: ToolRenderItem[];
}) => {
  if (tools.length === 0) {
    return null;
  }

  if (tools.length === 1) {
    return (
      <div className={toolListStyle({ kind: "single" })}>
        <ToolListContent
          tools={tools}
          onInteractiveToolSubmit={onInteractiveToolSubmit}
          onSelectToolTarget={onSelectToolTarget}
        />
      </div>
    );
  }

  return (
    <Collapsible.Root className={toolListStyle({ kind: "group" })} defaultOpen>
      <Collapsible.Trigger className={toolHeaderStyle}>
        <span className={toolHeaderIconStyle}>
          <Icon name="list" size="xs" />
        </span>
        <span style={{ flex: 1 }}>{tools.length} changes</span>
        <Icon name="chevronUp" data-chevron size="sm" />
      </Collapsible.Trigger>
      <Collapsible.Content className={collapsibleContentStyle}>
        <div className={toolGroupPanelStyle}>
          <ToolListContent
            tools={tools}
            onInteractiveToolSubmit={onInteractiveToolSubmit}
            onSelectToolTarget={onSelectToolTarget}
          />
        </div>
      </Collapsible.Content>
    </Collapsible.Root>
  );
};

export const AiAssistantSurface = ({
  error,
  input,
  messages,
  onClearMessages,
  onClose,
  onInputChange,
  onInteractiveToolSubmit,
  onSelectToolTarget,
  onStop,
  onSubmit,
  rightOffset = 0,
  status,
}: AiAssistantSurfaceProps) => {
  const isBusy = status === "submitted" || status === "streaming";
  const canSubmit = input.trim().length > 0 && !isBusy;
  const [assistantWidth, setAssistantWidth] = useState(420);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const messagesScrollKey = getMessagesScrollKey(messages);

  const onResizeStart = (event: ReactPointerEvent<HTMLDivElement>) => {
    event.preventDefault();
    const startX = event.clientX;
    const startWidth = assistantWidth;
    const maxWidth = Math.min(window.innerWidth - 32, 720);

    const onPointerMove = (moveEvent: PointerEvent) => {
      setAssistantWidth(
        Math.min(
          Math.max(startWidth + startX - moveEvent.clientX, 320),
          maxWidth,
        ),
      );
    };

    const onPointerUp = () => {
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
    };

    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
  };

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    const scrollToEnd = () => {
      messagesEndRef.current?.scrollIntoView?.({
        block: "end",
        behavior: "smooth",
      });
    };
    const requestFrame =
      window.requestAnimationFrame ??
      ((callback: FrameRequestCallback) => window.setTimeout(callback, 0));
    const cancelFrame =
      window.cancelAnimationFrame ??
      ((handle: number) => window.clearTimeout(handle));
    const frameId = requestFrame(scrollToEnd);

    return () => cancelFrame(frameId);
  }, [messagesScrollKey, status]);

  return (
    <aside
      className={shellStyle}
      style={{ right: rightOffset, width: assistantWidth }}
      aria-label="AI assistant"
    >
      <div
        aria-label="Resize AI assistant"
        className={resizeHandleStyle}
        onPointerDown={onResizeStart}
        role="separator"
      />
      <div className={cardStyle}>
        <div className={headerStyle}>
          <div className={tabStyle({ active: true })}>Petrinaut AI</div>
          <div style={{ flex: 1 }} />
          <Button
            size="xs"
            variant="ghost"
            tone="error"
            className={headerButtonStyle}
            aria-label="Clear AI chat"
            disabled={messages.length === 0}
            onClick={onClearMessages}
            iconName="trash"
            tooltip="Clear AI chat"
            tooltipDisplay="inline"
          />
          <Button
            size="xs"
            variant="ghost"
            className={headerButtonStyle}
            aria-label="Close AI assistant"
            onClick={onClose}
            iconName="close"
            tooltip="Close AI assistant"
            tooltipDisplay="inline"
          />
        </div>

        <div className={messagesStyle}>
          {messages.length === 0 && (
            <div className={emptyStyle}>
              <AiAssistantIcon size={28} />
              <div>
                Ask Petrinaut AI to create a Petri net, explain or revise the
                current model.
              </div>
            </div>
          )}
          {messages.map((message) => {
            const role = message.role === "user" ? "user" : "assistant";
            const assistantActivity = message.parts.some(isPartActive)
              ? "active"
              : "complete";
            const renderItems = getMessageRenderItems(message);

            return (
              <div
                key={message.id}
                className={messageStyle({
                  role,
                  activity: assistantActivity,
                })}
                data-activity={
                  role === "assistant" ? assistantActivity : undefined
                }
                data-role={role}
              >
                {renderItems.map((item) => {
                  switch (item.type) {
                    case "text":
                      return (
                        <div className={markdownStyle} key={item.key}>
                          <ReactMarkdown>{item.part.text}</ReactMarkdown>
                        </div>
                      );
                    case "reasoning":
                      return (
                        <ReasoningPart
                          key={item.key}
                          isStreaming={item.part.state === "streaming"}
                          text={item.part.text}
                        />
                      );
                    case "tools":
                      return (
                        <ToolList
                          key={item.key}
                          tools={item.tools}
                          onInteractiveToolSubmit={onInteractiveToolSubmit}
                          onSelectToolTarget={onSelectToolTarget}
                        />
                      );
                    default: {
                      const exhaustiveCheck: never = item;
                      throw new Error(
                        `Unknown message part: ${JSON.stringify(exhaustiveCheck)}`,
                      );
                    }
                  }
                })}
              </div>
            );
          })}
          {error && <div className={errorStyle}>{error.message}</div>}
          <div ref={messagesEndRef} />
        </div>

        <form
          className={composerWrapStyle}
          onSubmit={(event) => {
            event.preventDefault();
            if (canSubmit) {
              onSubmit();
            }
          }}
        >
          <div className={composerStyle}>
            <Input
              ref={inputRef}
              className={inputStyle}
              size="sm"
              value={input}
              onChange={(event) => onInputChange(event.currentTarget.value)}
              placeholder={
                messages.length === 0
                  ? "Get creating..."
                  : "Continue iterating..."
              }
              aria-label="Message Petrinaut AI"
            />
            <Button
              type={isBusy ? "button" : "submit"}
              size="sm"
              variant={isBusy ? "subtle" : "solid"}
              tone={isBusy ? "neutral" : "brand"}
              disabled={!isBusy && !canSubmit}
              aria-label={isBusy ? "Stop AI response" : "Send message"}
              onClick={() => {
                if (isBusy) {
                  onStop();
                }
              }}
              iconName={isBusy ? "stopFilled" : "arrowUp"}
              tooltip={isBusy ? "Stop AI response" : "Send message"}
              tooltipDisplay="inline"
            />
          </div>
        </form>
      </div>
    </aside>
  );
};
