/**
 * @layerRoot react.execution-frame
 * @role Abstracts where frames come from, so canvas and timeline work for live runs and recordings alike
 */

import { useEditorState } from "../state/editor-context";
import { ExecutionFrameSourceContext } from "./context";
import { useActualExecutionFrameSource } from "./use-actual-execution-frame-source";
import { useEventExecutionFrameSource } from "./use-event-execution-frame-source";

import type { FC, PropsWithChildren } from "react";

/**
 * Routes {@link ExecutionFrameSourceContext} to the adapter matching the
 * editor's global mode: the host-provided Actual mode stream in Actual mode,
 * the run's playback otherwise. A single element provides the context so switching modes
 * swaps the value without remounting the subtree.
 */
export const ExecutionFrameProvider: FC<PropsWithChildren> = ({ children }) => {
  const globalMode = useEditorState((editor) => editor.globalMode);
  const isActualMode = globalMode === "actual";
  const eventSource = useEventExecutionFrameSource();
  const actualSource = useActualExecutionFrameSource({
    enabled: isActualMode,
  });

  return (
    <ExecutionFrameSourceContext
      value={isActualMode ? actualSource : eventSource}
    >
      {children}
    </ExecutionFrameSourceContext>
  );
};
