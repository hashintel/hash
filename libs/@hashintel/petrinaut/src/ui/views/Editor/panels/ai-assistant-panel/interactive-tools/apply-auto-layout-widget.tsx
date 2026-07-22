import { Button } from "@hashintel/ds-components";
import { css } from "@hashintel/ds-helpers/css";
import {
  aiCommandActionInputSchemas,
  type AiCommandActionInput,
  type AiCommandActionName,
} from "@hashintel/petrinaut-core";

import type { AiToolOutput } from "../tool-summaries";
import type {
  InteractiveToolDefinition,
  InteractiveToolWidgetProps,
} from "./types";

type ApplyAutoLayoutInput = AiCommandActionInput<"applyAutoLayout">;

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

const buttonsStyle = css({
  display: "flex",
  alignItems: "center",
  gap: "2",
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
}: InteractiveToolWidgetProps<ApplyAutoLayoutInput, AiToolOutput>) => {
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
      <div className={buttonsStyle}>
        <Button
          size="sm"
          variant="solid"
          tone="brand"
          onClick={() =>
            submit({
              applied: true,
              title: "Auto-layout requested",
            })
          }
        >
          Yes, auto-layout
        </Button>
        <Button
          size="sm"
          variant="subtle"
          tone="neutral"
          onClick={() =>
            submit({ applied: false, reason: "User declined auto-layout." })
          }
        >
          No, keep current layout
        </Button>
      </div>
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
  AiToolOutput
> = {
  toolName: "applyAutoLayout" satisfies AiCommandActionName,
  shouldHandle: (raw): boolean => {
    const parsed = aiCommandActionInputSchemas.applyAutoLayout.safeParse(raw);
    return parsed.success && parsed.data.askUserFirst === true;
  },
  parseInput: (raw): ApplyAutoLayoutInput =>
    aiCommandActionInputSchemas.applyAutoLayout.parse(raw),
  Widget: ApplyAutoLayoutWidget,
};
