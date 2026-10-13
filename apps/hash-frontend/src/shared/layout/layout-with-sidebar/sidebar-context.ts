import { createContext, useContext } from "react";

type SidebarContextState = {
  sidebarOpen: boolean;
  openSidebar: () => void;
  closeSidebar: () => void;
};

export const SidebarContext = createContext<SidebarContextState>({
  sidebarOpen: true,
  openSidebar: () => {},
  closeSidebar: () => {},
});

export const useSidebarContext = () => useContext(SidebarContext);
