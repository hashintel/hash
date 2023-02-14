import { FunctionComponent, ReactNode } from "react";

import { useIsReadonlyModeForApp } from "../readonly-mode";
import { PageHeader } from "./layout-with-header/page-header";
import { PlainLayout } from "./plain-layout";

export const LayoutWithHeader: FunctionComponent<{
  children?: ReactNode;
}> = ({ children }) => {
  const isReadonlyMode = useIsReadonlyModeForApp();

  return (
    <PlainLayout>
      {!isReadonlyMode && <PageHeader />}
      {children}
    </PlainLayout>
  );
};
