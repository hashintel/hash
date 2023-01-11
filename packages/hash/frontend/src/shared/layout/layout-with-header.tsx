import { FunctionComponent, ReactNode } from "react";

import { useIsReadonlyMode } from "../readonly-mode";
import { PageHeader } from "./layout-with-header/page-header";
import { PlainLayout } from "./plain-layout";

export const LayoutWithHeader: FunctionComponent<{
  children?: ReactNode;
}> = ({ children }) => {
  const isReadonlyMode = useIsReadonlyMode();

  return (
    <PlainLayout>
      {!isReadonlyMode && <PageHeader />}
      {children}
    </PlainLayout>
  );
};
