import { useRouter } from "next/router";
import { FC } from "react";
import { PageHeader } from "../PageHeader/PageHeader";

const AUTH_ROUTES = ["/login", "/signup"];

export const PageLayout: FC = ({ children }) => {
  const router = useRouter();

  return (
    <>
      {!AUTH_ROUTES.includes(router.pathname) ? <PageHeader /> : null}
      {children}
    </>
  );
};
