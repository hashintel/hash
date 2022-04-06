import { NextPage } from "next";
import { ReactElement, ReactNode } from "react";

export type NextPageWithLayout<T = {}> = NextPage<T> & {
  getLayout?: (page: ReactElement) => ReactNode;
};
