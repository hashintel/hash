import { useRef } from "react";

import { css } from "@hashintel/ds-helpers/css";

import type { PetrinautAiAssistantPresentation } from "../../../../../../../petrinaut";
import type { OnInteractiveToolSubmit, ToolRenderItem } from "../../tool-list";

const interactiveToolStyle = css({
  display: "flex",
  flexDirection: "column",
  gap: "1",
});

export const InteractiveToolItem = ({
  onInteractiveToolSubmit,
  presentation,
  tool,
}: {
  onInteractiveToolSubmit?: OnInteractiveToolSubmit;
  presentation: PetrinautAiAssistantPresentation;
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
          presentation={presentation}
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
        presentation={presentation}
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
