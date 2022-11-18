import { ReactNode, FunctionComponent } from "react";
import { PageHeader } from "./layout-with-header/page-header";
import { PlainLayout } from "./plain-layout";
import { useReadonlyMode } from "../readonly-mode";

export const LayoutWithHeader: FunctionComponent<{
  children?: ReactNode;
}> = ({ children }) => {
  const { readonlyMode } = useReadonlyMode();

  return (
    <PlainLayout>
      {!readonlyMode && <PageHeader />}
      {children}
    </PlainLayout>
  );
};
