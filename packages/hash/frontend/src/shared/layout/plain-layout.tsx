import Head from "next/head";
import { ReactElement, ReactNode, FunctionComponent } from "react";
import NextNProgress from "nextjs-progressbar";
import { useTheme } from "@mui/material";
import { isProduction } from "../../lib/config";

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
      {children}
    </>
  );
};

export const getPlainLayout = (page: ReactElement) => {
  return <PlainLayout>{page}</PlainLayout>;
};
