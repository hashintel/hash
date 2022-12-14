import { ReactNode, FunctionComponent } from "react";
import { PageHeader } from "./layout-with-header/page-header";
import { PlainLayout } from "./plain-layout";
import { useIsReadonlyMode } from "../readonly-mode";

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
