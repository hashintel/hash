import type { FunctionComponent, ReactNode } from "react";

import { PageHeader } from "./layout-with-header/page-header";
import { PlainLayout } from "./plain-layout";

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
