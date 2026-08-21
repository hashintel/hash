import { Button, ButtonGroup } from "@hashintel/ds-components";
import { css } from "@hashintel/ds-helpers/css";
import {
  aiCommandActionInputSchemas,
  type AiCommandActionInput,
  type AiCommandActionName,
} from "@hashintel/petrinaut-core";

import type {
  InteractiveToolDefinition,
  InteractiveToolWidgetProps,
} from "./types";

type ApplyAutoLayoutInput = AiCommandActionInput<"applyAutoLayout">;
export type ApplyAutoLayoutDecision =
  | { readonly action: "apply" }
  | { readonly action: "decline" };
export type ApplyAutoLayoutResult =
  | { readonly applied: true; readonly title: string }
  | { readonly applied: false; readonly reason: string };

const widgetStyle = css({
  display: "flex",
  flexDirection: "column",
  gap: "2",
  padding: "2",
  borderRadius: "lg",
  borderWidth: "thin",
  borderStyle: "solid",
  borderColor: "[#bee6ff]",
  backgroundColor: "[#eff9ff]",
  color: "[#0666c6]",
  fontSize: "sm",
  fontWeight: "medium",
});

const summaryStyle = css({
  fontSize: "sm",
  fontWeight: "medium",
  color: "neutral.s100",
});

const ApplyAutoLayoutWidget = ({
  state,
  submit,
  submittedOutput,
}: InteractiveToolWidgetProps<
  ApplyAutoLayoutInput,
  ApplyAutoLayoutDecision,
  ApplyAutoLayoutResult
>) => {
  if (state === "submitted") {
    const verdict =
      submittedOutput?.applied === true
        ? submittedOutput.title
        : ((submittedOutput as { reason?: string } | undefined)?.reason ??
          "Auto-layout declined.");
    return (
      <div className={widgetStyle}>
        <span className={summaryStyle}>{verdict}</span>
      </div>
    );
  }

  return (
    <div className={widgetStyle}>
      <span>
        The assistant suggests running auto-layout on the net. This may
        reposition places and transitions.
      </span>
      <ButtonGroup spacing="sm">
        <Button
          size="sm"
          variant="solid"
          tone="brand"
          onClick={() => submit({ action: "apply" })}
        >
          Yes, auto-layout
        </Button>
        <Button
          size="sm"
          variant="subtle"
          tone="neutral"
          onClick={() => submit({ action: "decline" })}
        >
          No, keep current layout
        </Button>
      </ButtonGroup>
    </div>
  );
};

/**
 * Interactive descriptor for `applyAutoLayout`. The AI may opt out of the
 * confirmation by passing `askUserFirst: false`; we only intercept when it is
 * `true`.
 */
export const applyAutoLayoutInteractiveTool: InteractiveToolDefinition<
  ApplyAutoLayoutInput,
  ApplyAutoLayoutDecision,
  ApplyAutoLayoutResult,
  "applyAutoLayout"
> = {
  toolName: "applyAutoLayout" satisfies AiCommandActionName,
  shouldHandle: (raw): boolean => {
    const parsed = aiCommandActionInputSchemas.applyAutoLayout.safeParse(raw);
    return parsed.success && parsed.data.askUserFirst === true;
  },
  parseInput: (raw): ApplyAutoLayoutInput =>
    aiCommandActionInputSchemas.applyAutoLayout.parse(raw),
  parseOutput: (raw): ApplyAutoLayoutResult => {
    if (typeof raw !== "object" || raw === null) {
      throw new TypeError("Expected an auto-layout result object.");
    }
    if (
      "applied" in raw &&
      raw.applied === true &&
      "title" in raw &&
      typeof raw.title === "string"
    ) {
      return { applied: true, title: raw.title };
    }
    if (
      "applied" in raw &&
      raw.applied === false &&
      "reason" in raw &&
      typeof raw.reason === "string"
    ) {
      return { applied: false, reason: raw.reason };
    }
    throw new TypeError("Expected a completed auto-layout result.");
  },
  Widget: ApplyAutoLayoutWidget,
};
