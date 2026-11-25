/**
 * @layerRoot react.execution-frame
 * @role Serves the viewed execution by frame index to the consumers that still read it that way
 */

import { ExecutionFrameSourceContext } from "./context";
import { useEventExecutionFrameSource } from "./use-event-execution-frame-source";

import type { FC, PropsWithChildren } from "react";

/**
 * Provides {@link ExecutionFrameSourceContext} from the viewed execution's
 * trace and its playback. Which execution that is, a simulation's run or
 * the host's, was decided above: this reads a trace.
 */
export const ExecutionFrameProvider: FC<PropsWithChildren> = ({ children }) => (
  <ExecutionFrameSourceContext value={useEventExecutionFrameSource()}>
    {children}
  </ExecutionFrameSourceContext>
);
