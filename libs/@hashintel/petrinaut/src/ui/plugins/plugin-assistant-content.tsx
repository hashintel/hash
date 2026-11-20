import { PluginBoundary } from "./plugin-boundary";

import type { ReactNode } from "react";

/** A plugin's assistant content behind that plugin's error boundary. */
export const PluginAssistantContent = ({
  pluginId,
  children,
}: {
  pluginId: string;
  children: ReactNode;
}) => (
  <PluginBoundary pluginId={pluginId} place="assistant">
    {children}
  </PluginBoundary>
);
