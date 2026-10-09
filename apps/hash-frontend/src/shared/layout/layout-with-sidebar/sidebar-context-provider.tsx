import { useMemo, useState } from "react";

import { SidebarContext } from "./sidebar-context";

import type { FunctionComponent, ReactNode } from "react";

export const SidebarContextProvider: FunctionComponent<{
  children?: ReactNode;
}> = ({ children }) => {
  const [sidebarOpen, setSidebarOpen] = useState<boolean>(true);

  const value = useMemo(
    () => ({
      sidebarOpen,
      openSidebar: () => setSidebarOpen(true),
      closeSidebar: () => setSidebarOpen(false),
    }),
    [sidebarOpen, setSidebarOpen],
  );

  return (
    <SidebarContext.Provider value={value}>{children}</SidebarContext.Provider>
  );
};
