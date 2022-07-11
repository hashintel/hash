import { ReactNode, VFC } from "react";
import { PageHeader } from "./layout-with-header/page-header";
import { PlainLayout } from "./plain-layout";

export const LayoutWithHeader: VFC<{
  children?: ReactNode;
}> = ({ children }) => {
  return (
    <PlainLayout>
      <PageHeader />
      {children}
    </PlainLayout>
  );
};
