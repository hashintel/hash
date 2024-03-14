import type { NextPage } from "next";
import type { ReactElement, ReactNode } from "react";

import { LayoutWithHeader } from "./layout/layout-with-header";
import type { LayoutWithSidebarProps } from "./layout/layout-with-sidebar";
import { LayoutWithSidebar } from "./layout/layout-with-sidebar";
import { PlainLayout } from "./layout/plain-layout";

export type NextPageWithLayout<
  T extends Record<string, unknown> = Record<string, unknown>,
> = NextPage<T> & {
  getLayout?: (page: ReactElement) => ReactNode;
};

export const getPlainLayout = (page: ReactElement) => {
  return <PlainLayout>{page}</PlainLayout>;
};

export const getLayoutWithHeader = (page: ReactElement) => {
  return <LayoutWithHeader>{page}</LayoutWithHeader>;
};

export const getLayoutWithSidebar = (
  page: ReactElement,
  layoutWithSidebarProps: LayoutWithSidebarProps = {},
) => {
  return (
    <LayoutWithSidebar {...layoutWithSidebarProps}>{page}</LayoutWithSidebar>
  );
};
