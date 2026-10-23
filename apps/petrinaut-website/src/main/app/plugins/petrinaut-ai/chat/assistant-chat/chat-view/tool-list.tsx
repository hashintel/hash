import { css } from "@hashintel/ds-helpers/css";
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
  type AiToolSummary,
  summarizePetrinautAiToolCall,
} from "../tool-summaries";
import { ToolItem } from "./tool-list/tool-item";

import type { PetrinautAiMessage } from "../../ai-message";
import type { InteractiveToolDefinition } from "../interactive-tools/types";
import type { PetrinautRevealTarget } from "@hashintel/petrinaut/ui/plugin";

type SimulateViewMode = Extract<
  PetrinautRevealTarget,
  { kind: "simulateView" }
>["mode"];

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

const toolStateLabels: Record<string, string> = {
  "input-streaming": "Preparing…",
  "input-available": "Running…",
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

const simulateViewModes = {
  scenarios: true,
  metrics: true,
  experiments: true,
} satisfies Record<SimulateViewMode, true>;

const isSimulateViewMode = (value: unknown): value is SimulateViewMode =>
  typeof value === "string" && Object.hasOwn(simulateViewModes, value);

const getAiToolTarget = (value: unknown): PetrinautRevealTarget | undefined => {
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

  if (candidate.kind === "simulateView" && isSimulateViewMode(candidate.mode)) {
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
): ToolRenderItem => {
  const state = part.state ?? "input-available";
  const toolName = getToolName(part);
  const summary: AiToolSummary =
    state === "input-streaming"
      ? { title: toolName }
      : getToolSummaryFromPart(part);
  const notApplied = isNotAppliedResult(part);
  const errorText =
    state === "output-error" && typeof part.errorText === "string"
      ? part.errorText
      : undefined;

  const id =
    typeof part.toolCallId === "string"
      ? part.toolCallId
      : `${message.id}-${part.type}`;
  const interactiveDefinition = hasInteractiveToolInput(state)
    ? getInteractiveTool({ toolName, toolCallId: id, input: part.input })
    : undefined;
  const interactive = interactiveDefinition
    ? {
        definition: interactiveDefinition,
        input: part.input,
        submittedOutput: state === "output-available" ? part.output : undefined,
      }
    : undefined;

  return {
    id,
    state,
    input: part.input,
    output: part.output,
    summary,
    tone: getToolTone({ state, summary, toolName, notApplied }),
    toolName,
    notApplied,
    stateLabel: toolStateLabels[state] ?? "",
    errorText,
    interactive,
  };
};

const toolListStyle = css({
  display: "flex",
  flexDirection: "column",
  gap: "1",
});

/** Every tool as its own bordered row, in call order. */
export const AiAssistantToolList = ({
  onInteractiveToolSubmit,
  tools,
  stopped = false,
}: {
  onInteractiveToolSubmit?: OnInteractiveToolSubmit;
  tools: ToolRenderItem[];
  stopped?: boolean;
}) =>
  tools.length === 0 ? null : (
    <div className={toolListStyle}>
      {tools.map((tool) => (
        <ToolItem
          key={tool.id}
          tool={tool}
          stopped={stopped}
          onInteractiveToolSubmit={onInteractiveToolSubmit}
        />
      ))}
    </div>
  );
