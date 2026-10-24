import { useRef } from "react";

import { css } from "@hashintel/ds-helpers/css";

import type { OnInteractiveToolSubmit, ToolRenderItem } from "../../tool-list";

const interactiveToolStyle = css({
  display: "flex",
  flexDirection: "column",
  gap: "1",
});

/** A tool call that waits for the user, through its widget. */
export const InteractiveToolItem = ({
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
  // A rejected or invalid output leaves the widget waiting for another answer.
  const submit = (output: unknown) => {
    if (submittedOnceRef.current || !onInteractiveToolSubmit) {
      return;
    }
    try {
      const parsedOutput = definition.parseOutput(output);
      submittedOnceRef.current = true;
      void Promise.resolve(
        onInteractiveToolSubmit({
          toolCallId: tool.id,
          toolName: tool.toolName,
          output: parsedOutput,
        }),
      ).catch(() => {
        submittedOnceRef.current = false;
      });
    } catch {
      submittedOnceRef.current = false;
    }
  };

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
      </div>
    );
  }

  return (
    <div className={interactiveToolStyle} data-tool-call-id={tool.id}>
      <Widget
        input={typedInput}
        state="awaiting"
        submit={submit}
        toolCallId={tool.id}
      />
    </div>
  );
};
