import { useTheme } from "@mui/material";
import Head from "next/head";
import NextNProgress from "nextjs-progressbar";
import { FunctionComponent, ReactNode } from "react";

import { isProduction } from "../../lib/config";
import { useAuthInfo } from "../../pages/shared/auth-info-context";
import { CommandBar } from "../command-bar";

export const PlainLayout: FunctionComponent<{
  children?: ReactNode;
}> = ({ children }) => {
  const { palette } = useTheme();

  const { authenticatedUser } = useAuthInfo();

  return (
    <>
      <Head>
        <title>HASH Workspace</title>
        {!isProduction ? <meta name="robots" content="noindex" /> : null}
      </Head>
      <NextNProgress
        color={palette.primary.main}
        height={2}
        options={{ showSpinner: false }}
        showOnShallow
      />
      {authenticatedUser ? <CommandBar /> : null}
      {children}
    </>
  );
};
