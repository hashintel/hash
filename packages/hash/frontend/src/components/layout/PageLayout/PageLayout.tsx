import { FC } from "react";
import { PageHeader } from "../PageHeader/PageHeader";

export const PageLayout: FC = ({ children }) => {
  return (
    <>
      <PageHeader />
      {children}
    </>
  );
};
