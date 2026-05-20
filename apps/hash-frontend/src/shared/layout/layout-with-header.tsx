import { PageHeader } from "./layout-with-header/page-header";
import { PlainLayout } from "./plain-layout";

import type { FunctionComponent, ReactNode } from "react";

export const LayoutWithHeader: FunctionComponent<{
  children?: ReactNode;
}> = ({ children }) => {
  return (
    <PlainLayout>
      <PageHeader />
      {children}
    </PlainLayout>
  );
};
