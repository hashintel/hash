import { createContext, Profiler, type ReactNode, use } from "react";

import type { PluginPerformanceRuntime } from "./plugin-performance";

export const PluginPerformanceContext =
  createContext<PluginPerformanceRuntime | null>(null);

export const PluginProfile = ({
  pluginId,
  children,
}: {
  pluginId: string;
  children: ReactNode;
}) => {
  const performance = use(PluginPerformanceContext);

  return (
    <Profiler
      id={pluginId}
      onRender={(
        id,
        _phase,
        actualDuration,
        _baseDuration,
        _startTime,
        commitTime,
      ) => performance?.rendered(id, actualDuration, commitTime)}
    >
      {children}
    </Profiler>
  );
};
