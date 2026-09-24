import { Collapsible } from "@ark-ui/react/collapsible";
import { useRef, useState } from "react";

import { Icon, LoadingSpinner } from "@hashintel/ds-components";
import { css, cva } from "@hashintel/ds-helpers/css";
import {
  getLatestNetDefinitionToolName,
  getNetCompilationErrorsToolName,
  petrinautAiMutationTools,
  readPetrinautDocToolName,
  type SelectionItem,
  setNetTitleToolName,
} from "@hashintel/petrinaut-core";

import { getInteractiveTool } from "../interactive-tools/registry";
import {
  type AiToolTarget,
  type AiToolSummary,
  summarizePetrinautAiToolCall,
} from "../tool-summaries";
import { collapsibleContentStyle } from "./shared/collapsible-content-style";
import { useElapsedTime } from "./shared/use-elapsed-time";

import type { PetrinautAiToolPresentationResolver } from "../../../../../petrinaut";
import type { PetrinautAiInteractiveTool } from "../../../../../types/ai-interactive-tool";
import type { InteractiveToolDefinition } from "../interactive-tools/types";
import type { PetrinautAiMessage } from "../types";

export type ToolTone = "danger" | "info" | "neutral" | "pending" | "success";

// User-guide pages are published in the repo, so a doc tool row links to the
// matching markdown page on GitHub (matching the editor "Docs" menu entry).
const petrinautDocsBaseUrl =
  "https://github.com/hashintel/hash/blob/main/libs/%40hashintel/petrinaut/docs";

export type ToolRenderItem = {
  id: string;
  state: string;
  input?: unknown;
  output?: unknown;
  summary: AiToolSummary;
  hasConfiguredTitle: boolean;
  tone: ToolTone;
  toolName: string;
  notApplied: boolean;
  stateLabel: string;
  /** Server-reported error message for tools whose state is `output-error`. */
  errorText?: string;
  /** Set when the tool requires an inline widget for human input. */
  interactive?: {
    definition: InteractiveToolDefinition<unknown, unknown>;
    input: unknown;
    submittedOutput?: unknown;
  };
};

type DefaultToolStateLabels = {
  readonly inputStreaming: string;
  readonly inputAvailable: string;
  readonly outputAvailable: string;
  readonly outputError: string;
};

export const defaultPetrinautAiToolStateLabels: DefaultToolStateLabels = {
  inputStreaming: "Preparing…",
  inputAvailable: "Running…",
  outputAvailable: "",
  outputError: "",
};

export type RenderableToolPart = PetrinautAiMessage["parts"][number] & {
  errorText?: unknown;
  input?: unknown;
  output?: unknown;
  state?: string;
  toolCallId?: string;
  toolName?: unknown;
  type: `tool-${string}` | "dynamic-tool";
};

export type OnInteractiveToolSubmit = (params: {
  toolCallId: string;
  toolName: string;
  output: unknown;
}) => void | PromiseLike<void>;

const toolListStyle = css({
  display: "flex",
  flexDirection: "column",
  gap: "1",
});

const toolItemCollapsibleStyle = css({
  "& > button": {
    borderRadius: "[0]",
  },
});

const statusDotStyle = css({
  width: "[6px]",
  height: "[6px]",
  borderRadius: "full",
  flexShrink: 0,
  backgroundColor: "yellow.s90",
  '&[data-tool-status="ok"]': { backgroundColor: "green.s90" },
  '&[data-tool-status="error"]': { backgroundColor: "red.s90" },
  '&[data-tool-status="cancelled"]': {
    backgroundColor: "neutral.s80",
    height: "[2px]",
  },
});

const interactiveToolStyle = css({
  display: "flex",
  flexDirection: "column",
  gap: "1",
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
    border: "none",
    borderRadius: "md",
    backgroundColor: "[transparent]",
    color: "neutral.s90",
    fontSize: "xs",
    fontWeight: "medium",
    textAlign: "left",
    cursor: "default",
    _enabled: {
      cursor: "pointer",
    },
    _hover: { backgroundColor: "neutral.a20" },
    "& svg[data-chevron]": {
      marginLeft: "auto",
      transition: "[transform 150ms ease-out]",
    },
    "&[data-state=closed] svg[data-chevron]": {
      transform: "[rotate(90deg)]",
    },
    "&[data-state=open] svg[data-chevron]": {
      transform: "[rotate(180deg)]",
    },
  },
  variants: {
    tone: {
      danger: {
        color: "red.s100",
      },
      info: {
        color: "neutral.s100",
      },
      neutral: {
        color: "neutral.s90",
      },
      pending: {
        color: "neutral.s90",
      },
      success: {
        color: "neutral.s90",
      },
    },
    link: {
      true: {
        cursor: "pointer",
        textDecoration: "none",
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

export const isToolPart = (
  part: PetrinautAiMessage["parts"][number],
): part is RenderableToolPart =>
  part.type === "dynamic-tool" || part.type.startsWith("tool-");

export const getToolName = (part: RenderableToolPart) =>
  part.type === "dynamic-tool" && typeof part.toolName === "string"
    ? part.toolName
    : part.type.replace(/^tool-/, "");

const hasInteractiveToolInput = (state: string): boolean =>
  state === "input-available" || state === "output-available";

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

const isNotAppliedResult = (part: RenderableToolPart): boolean =>
  part.state === "output-available" &&
  typeof part.output === "object" &&
  part.output !== null &&
  "applied" in part.output &&
  part.output.applied === false;

export const getToolSummaryFromPart = (
  part: RenderableToolPart,
): AiToolSummary => {
  const toolName = getToolName(part);
  if (toolName === getLatestNetDefinitionToolName) {
    return { title: "Checked latest net definition" };
  }
  if (toolName === getNetCompilationErrorsToolName) {
    return { title: "Checked net compilation errors" };
  }
  if (toolName === readPetrinautDocToolName) {
    const docName =
      typeof part.input === "object" &&
      part.input !== null &&
      typeof (part.input as { doc?: unknown }).doc === "string"
        ? (part.input as { doc: string }).doc
        : undefined;
    return {
      title: docName ? `Read user guide: ${docName}` : "Read user guide",
      href: docName ? `${petrinautDocsBaseUrl}/${docName}.md` : undefined,
    };
  }
  if (isNotAppliedResult(part)) {
    const output = part.output as { reason?: unknown };
    return {
      title: "Not applied",
      detail:
        typeof output.reason === "string"
          ? output.reason
          : "No change was applied.",
    };
  }
  if (toolName === setNetTitleToolName) {
    const proposedTitle =
      typeof part.input === "object" &&
      part.input !== null &&
      typeof (part.input as { title?: unknown }).title === "string"
        ? (part.input as { title: string }).title
        : undefined;
    if (proposedTitle) {
      return { title: `Renaming net to "${proposedTitle}"` };
    }
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
  notApplied,
}: {
  state: string;
  summary: AiToolSummary;
  toolName: string;
  notApplied: boolean;
}): ToolTone => {
  if (state === "output-error") {
    return "danger";
  }
  if (notApplied) return "neutral";

  if (
    toolName === getLatestNetDefinitionToolName ||
    toolName === getNetCompilationErrorsToolName ||
    toolName === readPetrinautDocToolName
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

export const toToolRenderItem = (
  message: PetrinautAiMessage,
  part: RenderableToolPart,
  interactiveTools: readonly PetrinautAiInteractiveTool[] = [],
  resolveToolPresentation?: PetrinautAiToolPresentationResolver,
): ToolRenderItem => {
  const state = part.state ?? "input-available";
  const toolName = getToolName(part);
  const defaultSummary: AiToolSummary =
    state === "input-streaming"
      ? { title: toolName }
      : getToolSummaryFromPart(part);
  const notApplied = isNotAppliedResult(part);
  const errorText =
    state === "output-error" && typeof part.errorText === "string"
      ? part.errorText
      : undefined;
  const presentation = resolveToolPresentation?.({
    toolName,
    state:
      state === "output-error"
        ? "error"
        : state === "output-available"
          ? "success"
          : "pending",
    input: part.input,
    output: part.output,
    error: errorText,
  });
  const summary = presentation
    ? {
        ...defaultSummary,
        title: presentation.title,
        detail:
          state === "output-error"
            ? (errorText ?? presentation.detail ?? defaultSummary.detail)
            : (presentation.detail ??
              (presentation.items === undefined
                ? defaultSummary.detail
                : undefined)),
        items:
          presentation.items === undefined
            ? defaultSummary.items
            : [...presentation.items],
      }
    : defaultSummary;

  const interactiveDefinition = hasInteractiveToolInput(state)
    ? getInteractiveTool(toolName, part.input, interactiveTools)
    : undefined;
  const interactive = interactiveDefinition
    ? {
        definition: interactiveDefinition,
        input: part.input,
        submittedOutput: state === "output-available" ? part.output : undefined,
      }
    : undefined;

  return {
    id:
      typeof part.toolCallId === "string"
        ? part.toolCallId
        : `${message.id}-${part.type}`,
    state,
    input: part.input,
    output: part.output,
    summary,
    hasConfiguredTitle: presentation !== undefined,
    tone:
      presentation?.tone ??
      getToolTone({ state, summary, toolName, notApplied }),
    toolName,
    notApplied,
    stateLabel:
      presentation !== undefined
        ? ""
        : state === "input-streaming"
          ? defaultPetrinautAiToolStateLabels.inputStreaming
          : state === "input-available"
            ? defaultPetrinautAiToolStateLabels.inputAvailable
            : state === "output-error"
              ? defaultPetrinautAiToolStateLabels.outputError
              : defaultPetrinautAiToolStateLabels.outputAvailable,
    errorText,
    interactive,
  };
};

const InteractiveToolItem = ({
  onInteractiveToolSubmit,
  tool,
}: {
  onInteractiveToolSubmit?: OnInteractiveToolSubmit;
  tool: ToolRenderItem;
}) => {
  const interactive = tool.interactive;
  if (!interactive) {
    throw new Error(`Missing interactive definition for ${tool.toolName}`);
  }

  const { definition, input, submittedOutput } = interactive;
  const submitted = tool.state === "output-available";
  const submittedOnceRef = useRef(submitted);
  const Widget = definition.Widget;
  const typedInput = definition.parseInput(input);
  const submitAndWait = (output: unknown): Promise<void> => {
    if (submittedOnceRef.current) {
      return Promise.resolve();
    }
    if (!onInteractiveToolSubmit) {
      const submissionPromise = Promise.reject(
        new Error("Interactive tool submission is unavailable."),
      );
      void submissionPromise.catch(() => undefined);
      return submissionPromise;
    }

    try {
      const parsedOutput = definition.parseOutput(output);
      submittedOnceRef.current = true;
      const submission = onInteractiveToolSubmit({
        toolCallId: tool.id,
        toolName: tool.toolName,
        output: parsedOutput,
      });
      const submissionPromise = Promise.resolve(submission);
      void submissionPromise.catch(() => {
        submittedOnceRef.current = false;
      });
      return submissionPromise;
    } catch (error) {
      submittedOnceRef.current = false;
      const submissionPromise = Promise.reject(error);
      void submissionPromise.catch(() => undefined);
      return submissionPromise;
    }
  };

  if (submitted) {
    return (
      <div className={interactiveToolStyle} data-tool-call-id={tool.id}>
        <Widget
          input={typedInput}
          state="submitted"
          submit={() => {}}
          submitAndWait={() => Promise.resolve()}
          submittedOutput={definition.parseOutput(submittedOutput)}
          toolCallId={tool.id}
        />
      </div>
    );
  }

  return (
    <div className={interactiveToolStyle} data-tool-call-id={tool.id}>
      <Widget
        input={typedInput}
        state="awaiting"
        submit={(output) => {
          void submitAndWait(output);
        }}
        submitAndWait={submitAndWait}
        toolCallId={tool.id}
      />
    </div>
  );
};

const ToolItem = ({
  onInteractiveToolSubmit,
  onSelectToolTarget,
  tool,
  active = false,
  stopped = false,
}: {
  onInteractiveToolSubmit?: OnInteractiveToolSubmit;
  onSelectToolTarget?: (target: AiToolTarget) => void;
  tool: ToolRenderItem;
  active?: boolean;
  stopped?: boolean;
}) => {
  const inProgress =
    tool.state === "input-streaming" || tool.state === "input-available";
  const cancelled = stopped && inProgress;
  const duration = useElapsedTime(active && inProgress && !tool.interactive);
  if (tool.interactive && !cancelled) {
    return (
      <InteractiveToolItem
        onInteractiveToolSubmit={onInteractiveToolSubmit}
        tool={tool}
      />
    );
  }

  const complete = tool.state === "output-available";
  const errored = tool.state === "output-error";
  const stateLabel = cancelled ? "Cancelled" : tool.stateLabel || undefined;
  const target = tool.summary.target;
  const href = tool.summary.href;
  const children = tool.summary.items ?? [];
  const title =
    errored && !tool.hasConfiguredTitle
      ? (tool.errorText ?? "Tool failed")
      : tool.summary.title;

  const button = (
    <button
      type="button"
      className={toolItemStyle({ tone: tool.tone })}
      data-tone={tool.tone}
      aria-busy={inProgress && !cancelled ? true : undefined}
      onClick={() => {
        if (target) {
          onSelectToolTarget?.(target);
        }
      }}
    >
      <span
        className={statusDotStyle}
        data-tool-status={
          cancelled
            ? "cancelled"
            : errored
              ? "error"
              : complete
                ? "ok"
                : "pending"
        }
        aria-label={
          cancelled
            ? "Cancelled"
            : errored
              ? "Error"
              : complete
                ? "Complete"
                : "Pending"
        }
      />
      <span className={toolTextStyle}>
        <span>{title}</span>
        {errored && !tool.hasConfiguredTitle ? (
          <span className={toolDetailStyle} data-testid="tool-detail">
            {tool.toolName}
          </span>
        ) : tool.summary.detail ? (
          <span className={toolDetailStyle} data-testid="tool-detail">
            {tool.summary.detail}
          </span>
        ) : null}
        {stateLabel && <span className={toolDetailStyle}>{stateLabel}</span>}
      </span>
      <span
        className={toolDetailStyle}
        title={duration === undefined ? "Duration unavailable" : undefined}
      >
        {duration === undefined ? "—" : `${(duration / 1_000).toFixed(1)}s`}
      </span>
      <Icon name="chevronUp" data-chevron size="sm" />
    </button>
  );

  return (
    <Collapsible.Root className={toolItemCollapsibleStyle} defaultOpen={false}>
      <Collapsible.Trigger asChild>{button}</Collapsible.Trigger>
      <Collapsible.Content className={collapsibleContentStyle}>
        <div className={toolSubItemListStyle}>
          <strong>{tool.toolName}</strong>
          {href && !errored && (
            <a href={href} target="_blank" rel="noopener noreferrer">
              Open user guide
            </a>
          )}
          <strong>Arguments</strong>
          <pre
            className={css({
              whiteSpace: "pre-wrap",
              overflowWrap: "anywhere",
            })}
          >
            {tool.input === undefined
              ? "Not available"
              : JSON.stringify(tool.input, null, 2)}
          </pre>
          <strong>Result</strong>
          <pre
            className={css({
              whiteSpace: "pre-wrap",
              overflowWrap: "anywhere",
            })}
          >
            {tool.errorText ??
              (tool.output === undefined
                ? cancelled
                  ? "Cancelled before a result was received"
                  : "Pending"
                : JSON.stringify(tool.output, null, 2))}
          </pre>
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
  onInteractiveToolSubmit?: OnInteractiveToolSubmit;
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

export const AiAssistantToolList = ({
  onInteractiveToolSubmit,
  onSelectToolTarget,
  tools,
  active = false,
  stopped = false,
  producedCard = false,
}: {
  onInteractiveToolSubmit?: OnInteractiveToolSubmit;
  onSelectToolTarget?: (target: AiToolTarget) => void;
  tools: ToolRenderItem[];
  active?: boolean;
  stopped?: boolean;
  producedCard?: boolean;
}) => {
  const running =
    active &&
    !stopped &&
    tools.some(
      (tool) =>
        !tool.interactive &&
        (tool.state === "input-streaming" || tool.state === "input-available"),
    );
  const [disclosure, setDisclosure] = useState({ running, open: running });
  if (disclosure.running !== running) setDisclosure({ running, open: running });
  if (tools.length === 0) {
    return null;
  }

  const content = (
    <div className={toolListStyle}>
      <ToolListContent
        tools={tools}
        onInteractiveToolSubmit={onInteractiveToolSubmit}
        onSelectToolTarget={onSelectToolTarget}
      />
    </div>
  );

  if (producedCard) return content;
  return (
    <>
      <Collapsible.Root
        open={disclosure.open}
        onOpenChange={({ open }) => setDisclosure({ running, open })}
      >
        <Collapsible.Trigger className={toolItemStyle({ tone: "neutral" })}>
          {running ? (
            <LoadingSpinner size="xs" aria-hidden="true" />
          ) : (
            <Icon name="lightning" size="sm" />
          )}
          {running
            ? "Running tools"
            : `${stopped ? "Stopped after" : "Used"} ${tools.length} ${tools.length === 1 ? "tool" : "tools"}`}
          <Icon name="chevronUp" size="sm" data-chevron />
        </Collapsible.Trigger>
        <Collapsible.Content className={collapsibleContentStyle}>
          <div className={toolListStyle}>
            {tools
              .filter(
                (tool) => !tool.interactive || tool.state !== "input-available",
              )
              .map((tool) => (
                <ToolItem
                  key={tool.id}
                  tool={tool}
                  active={active && !stopped}
                  stopped={stopped}
                  onInteractiveToolSubmit={onInteractiveToolSubmit}
                  onSelectToolTarget={onSelectToolTarget}
                />
              ))}
          </div>
        </Collapsible.Content>
      </Collapsible.Root>
      {tools
        .filter((tool) => tool.interactive && tool.state === "input-available")
        .map((tool) => (
          <ToolItem
            key={tool.id}
            tool={tool}
            stopped={stopped}
            onInteractiveToolSubmit={onInteractiveToolSubmit}
            onSelectToolTarget={onSelectToolTarget}
          />
        ))}
    </>
  );
};
