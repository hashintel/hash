import { NextPage } from "next";
import { ReactElement, ReactNode } from "react";
import { LayoutWithHeader } from "./layout/layout-with-header";
import {
  LayoutWithSidebar,
  SidebarContextProvider,
} from "./layout/layout-with-sidebar";
import { PlainLayout } from "./layout/plain-layout";

export type NextPageWithLayout<T = {}> = NextPage<T> & {
  getLayout?: (page: ReactElement) => ReactNode;
};

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
