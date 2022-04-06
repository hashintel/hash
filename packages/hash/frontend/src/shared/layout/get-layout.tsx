import { ReactElement } from "react";
import { LayoutWithHeader } from "./layout-with-header";
import { LayoutWithSidebar } from "./layout-with-sidebar";
import { SidebarContextProvider } from "./layout-with-sidebar/sidebar-context";
import { PlainLayout } from "./plain-layout";

export const getPlainLayout = (page: ReactElement) => {
  return <PlainLayout>{page}</PlainLayout>;
};

export const getLayoutWithHeader = (page: ReactElement) => {
  return <LayoutWithHeader>{page}</LayoutWithHeader>;
};

export const getLayoutWithSidebar = (page: ReactElement) => {
  return (
    <SidebarContextProvider>
      <LayoutWithSidebar>{page}</LayoutWithSidebar>
    </SidebarContextProvider>
  );
};
