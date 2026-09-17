import { Collapsible } from "@ark-ui/react/collapsible";
import { useRef } from "react";

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
import { VoiceInputProvenance } from "./voice-input-provenance";

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
  summary: AiToolSummary;
  hasConfiguredTitle: boolean;
  tone: ToolTone;
  toolName: string;
  notApplied: boolean;
  stateLabel: string;
  /** True only for the persisted spoken answer to this exact tool call. */
  voiceOrigin: boolean;
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
      pending: {
        backgroundColor: "yellow.s20",
        borderColor: "yellow.a40",
      },
      success: {
        backgroundColor: "green.s20",
        borderColor: "green.a40",
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
      pending: {
        backgroundColor: "yellow.s90",
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

const toolProgressSpinnerStyle = css({
  "@media (prefers-reduced-motion: reduce)": {
    animation: "[none !important]",
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
    voiceOrigin:
      state === "output-available" &&
      typeof part.toolCallId === "string" &&
      message.metadata?.source === "voice" &&
      (message.metadata.voiceToolCallIds?.includes(part.toolCallId) === true ||
        message.metadata.toolCallId === part.toolCallId),
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

  if (submitted) {
    return (
      <div className={interactiveToolStyle} data-tool-call-id={tool.id}>
        <Widget
          input={typedInput}
          state="submitted"
          submit={() => {}}
          submittedOutput={definition.parseOutput(submittedOutput)}
          toolCallId={tool.id}
        />
        {tool.voiceOrigin && <VoiceInputProvenance />}
      </div>
    );
  }

  return (
    <div className={interactiveToolStyle} data-tool-call-id={tool.id}>
      <Widget
        input={typedInput}
        state="awaiting"
        submit={(output) => {
          if (submittedOnceRef.current || !onInteractiveToolSubmit) {
            return;
          }

          const parsedOutput = definition.parseOutput(output);
          submittedOnceRef.current = true;
          try {
            const submission = onInteractiveToolSubmit({
              toolCallId: tool.id,
              toolName: tool.toolName,
              output: parsedOutput,
            });
            void Promise.resolve(submission).catch(() => {
              submittedOnceRef.current = false;
            });
          } catch (error) {
            submittedOnceRef.current = false;
            throw error;
          }
        }}
        toolCallId={tool.id}
      />
    </div>
  );
};

const ToolItem = ({
  onInteractiveToolSubmit,
  onSelectToolTarget,
  tool,
}: {
  onInteractiveToolSubmit?: OnInteractiveToolSubmit;
  onSelectToolTarget?: (target: AiToolTarget) => void;
  tool: ToolRenderItem;
}) => {
  if (tool.interactive) {
    return (
      <InteractiveToolItem
        onInteractiveToolSubmit={onInteractiveToolSubmit}
        tool={tool}
      />
    );
  }

  const complete = tool.state === "output-available";
  const errored = tool.state === "output-error";
  const stateLabel = tool.stateLabel || undefined;
  const inProgress =
    tool.state === "input-streaming" || tool.state === "input-available";
  const target = tool.summary.target;
  const href = tool.summary.href;
  const children = tool.summary.items ?? [];
  const expandable = children.length > 0;
  const title =
    errored && !tool.hasConfiguredTitle
      ? (tool.errorText ?? "Tool failed")
      : tool.summary.title;

  if (href && !errored) {
    return (
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className={toolItemStyle({ tone: tool.tone, link: true })}
        data-tone={tool.tone}
        aria-busy={inProgress ? true : undefined}
      >
        <span
          className={toolStatusStyle({
            state: complete ? "complete" : "active",
            tone: tool.tone,
          })}
        >
          {complete ? (
            <Icon name="check" size="xs" />
          ) : inProgress ? (
            <LoadingSpinner
              aria-hidden="true"
              className={toolProgressSpinnerStyle}
              data-tool-progress-spinner
              size="xs"
              variant="bars"
            />
          ) : null}
        </span>
        <span className={toolTextStyle}>
          <span>{title}</span>
          {tool.summary.detail && (
            <span className={toolDetailStyle} data-testid="tool-detail">
              {tool.summary.detail}
            </span>
          )}
          {stateLabel && <span className={toolDetailStyle}>{stateLabel}</span>}
        </span>
      </a>
    );
  }

  const button = (
    <button
      type="button"
      className={toolItemStyle({ tone: tool.tone })}
      data-tone={tool.tone}
      disabled={!target && !expandable}
      aria-busy={inProgress ? true : undefined}
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
        ) : tool.notApplied ? (
          <Icon name="dash" size="xs" data-tool-result-icon="not-applied" />
        ) : complete ? (
          <Icon name="check" size="xs" data-tool-result-icon="complete" />
        ) : inProgress ? (
          <LoadingSpinner
            aria-hidden="true"
            className={toolProgressSpinnerStyle}
            data-tool-progress-spinner
            size="xs"
            variant="bars"
          />
        ) : null}
      </span>
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
}: {
  onInteractiveToolSubmit?: OnInteractiveToolSubmit;
  onSelectToolTarget?: (target: AiToolTarget) => void;
  tools: ToolRenderItem[];
}) => {
  if (tools.length === 0) {
    return null;
  }

  return (
    <div className={toolListStyle}>
      <ToolListContent
        tools={tools}
        onInteractiveToolSubmit={onInteractiveToolSubmit}
        onSelectToolTarget={onSelectToolTarget}
      />
    </div>
  );
};
