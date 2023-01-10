import { useTheme } from "@mui/material";
import Head from "next/head";
import NextNProgress from "nextjs-progressbar";
import { FunctionComponent, ReactElement, ReactNode } from "react";

import { isProduction } from "../../lib/config";
import { EntityTypesContextProvider } from "../entity-types-context/provider";

export const PlainLayout: FunctionComponent<{
  children?: ReactNode;
}> = ({ children }) => {
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
      <EntityTypesContextProvider>{children}</EntityTypesContextProvider>
    </>
  );
};

export const getPlainLayout = (page: ReactElement) => {
  return <PlainLayout>{page}</PlainLayout>;
};
