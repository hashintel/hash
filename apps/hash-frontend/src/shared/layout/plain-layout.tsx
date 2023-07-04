import { OwnedById } from "@local/hash-subgraph";
import { useTheme } from "@mui/material";
import Head from "next/head";
import NextNProgress from "nextjs-progressbar";
import { FunctionComponent, ReactNode, useContext } from "react";

import { isProduction } from "../../lib/config";
import { WorkspaceContext } from "../../pages/shared/workspace-context";
import { CommandBar } from "../command-bar";

export const PlainLayout: FunctionComponent<{
  children?: ReactNode;
}> = ({ children }) => {
  const { activeWorkspaceAccountId } = useContext(WorkspaceContext);

  const { palette } = useTheme();

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
      <CommandBar namespaceOwnedById={activeWorkspaceAccountId as OwnedById} />
      {children}
    </>
  );
};
