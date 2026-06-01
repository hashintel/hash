import { Collapsible } from "@ark-ui/react/collapsible";

import { Icon } from "@hashintel/ds-components";
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
  type AiToolOutput,
  type AiToolTarget,
  type AiToolSummary,
  summarizePetrinautAiToolCall,
} from "../tool-summaries";
import { collapsibleContentStyle } from "./shared/collapsible-content-style";

import type { InteractiveToolDefinition } from "../interactive-tools/types";
import type { PetrinautAiMessage } from "../types";

export type ToolTone = "danger" | "info" | "neutral" | "success";

// User-guide pages are published in the repo, so a doc tool row links to the
// matching markdown page on GitHub (matching the editor "Docs" menu entry).
const petrinautDocsBaseUrl =
  "https://github.com/hashintel/hash/blob/main/libs/%40hashintel/petrinaut/docs";

export type ToolRenderItem = {
  id: string;
  state: string;
  summary: AiToolSummary;
  tone: ToolTone;
  toolName: string;
  /** Server-reported error message for tools whose state is `output-error`. */
  errorText?: string;
  /** Set when the tool requires an inline widget for human input. */
  interactive?: {
    definition: InteractiveToolDefinition<unknown, AiToolOutput>;
    input: unknown;
    submittedOutput?: AiToolOutput;
  };
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
  output: AiToolOutput;
}) => void;

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
  borderRadius: "lg",
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
  width: "full",
  height: "8",
  paddingX: "2",
  border: "none",
  backgroundColor: "[transparent]",
  cursor: "pointer",
  fontSize: "sm",
  fontWeight: "medium",
  textAlign: "left",
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
  // The `arrow-right-arrow-left` glyph fills more of its 640×640 viewBox than
  // the other tool-status icons (check/close), so even at `size="xs"` (12px)
  // it looks crowded inside the 14px circle. Pull the inner svg back to a
  // tighter visual size — descendant selector wins over the Icon recipe's
  // own class-level width/height.
  "& svg": {
    width: "[9px]",
    height: "[9px]",
  },
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

export const isToolPart = (
  part: PetrinautAiMessage["parts"][number],
): part is RenderableToolPart =>
  part.type === "dynamic-tool" || part.type.startsWith("tool-");

export const getToolName = (part: RenderableToolPart) =>
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
    errorText:
      state === "output-error" && typeof part.errorText === "string"
        ? part.errorText
        : undefined,
    interactive,
  };
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
  const href = tool.summary.href;
  const children = tool.summary.items ?? [];
  const expandable = children.length > 0;
  const title = errored ? `${tool.toolName} errored` : tool.summary.title;

  if (href && !errored) {
    return (
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className={toolItemStyle({ tone: tool.tone, link: true })}
        data-tone={tool.tone}
      >
        <span
          className={toolStatusStyle({
            state: complete ? "complete" : "active",
            tone: tool.tone,
          })}
        >
          {complete ? <Icon name="check" size="xs" /> : null}
        </span>
        <span className={toolTextStyle}>
          <span>{title}</span>
          {tool.summary.detail && (
            <span className={toolDetailStyle} data-testid="tool-detail">
              {tool.summary.detail}
            </span>
          )}
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
      onClick={() => {
        if (target) {
          onSelectToolTarget?.(target);
        }
      }}
      title={errored ? tool.errorText : undefined}
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
  const allComplete = tools.every(
    (tool) =>
      tool.state === "output-available" || tool.state === "output-error",
  );

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

  // Remount when the group transitions between in-progress and complete so
  // `defaultOpen` re-initialises (auto-collapse on completion) without
  // controlled state fighting user toggles.
  return (
    <Collapsible.Root
      key={allComplete ? "complete" : "streaming"}
      className={toolListStyle({ kind: "group" })}
      defaultOpen={!allComplete}
    >
      <Collapsible.Trigger className={toolHeaderStyle}>
        <span className={toolHeaderIconStyle}>
          <Icon name="arrowsLeftRight" size="xs" />
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
