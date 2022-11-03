import {
  createContext,
  FunctionComponent,
  ReactNode,
  useContext,
  useMemo,
  useState,
} from "react";

type SidebarContextState = {
  sidebarOpen: boolean;
  openSidebar: () => void;
  closeSidebar: () => void;
};

const SidebarContext = createContext<SidebarContextState>({
  sidebarOpen: true,
  openSidebar: () => {},
  closeSidebar: () => {},
});

export const useSidebarContext = () => useContext(SidebarContext);

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
