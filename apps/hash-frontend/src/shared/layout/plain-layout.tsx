import Head from "next/head";
import { useRouter } from "next/router";
import type { DefaultSeo,DefaultSeoProps  } from "next-seo";
import NextNProgress from "nextjs-progressbar";
import type { FunctionComponent, ReactNode } from "react";
import { useTheme } from "@mui/material";

import { isProduction } from "../../lib/config";
import { useAuthInfo } from "../../pages/shared/auth-info-context";
import { CommandBar } from "../command-bar";

const defaultSeoProps: DefaultSeoProps = {
  defaultTitle: "HASH",
  titleTemplate: "%s | HASH",
  description:
    "Integrate live data, construct ontologies, and create shared understanding in a collaborative, open-source workspace.",
  twitter: {
    cardType: "summary_large_image",
    site: "@hashintel",
  },
  openGraph: {
    // @todo add a cover image
    // images: [{ url: `${frontendUrl}/TODO.png` }],
    siteName: "HASH for Developers",
    type: "website",
  },
};

export const PlainLayout: FunctionComponent<{
  children?: ReactNode;
}> = ({ children }) => {
  const { palette } = useTheme();

  const router = useRouter();

  const { authenticatedUser } = useAuthInfo();

  return (
    <>
      <Head>
        {!isProduction ? <meta name={"robots"} content={"noindex"} /> : null}
      </Head>
      <DefaultSeo
        {...defaultSeoProps}
        additionalLinkTags={[
          {
            rel: "icon",
            href: `/favicon.png?v=${router.asPath}`, // force favicon refresh on route change
          },
        ]}
      />
      <NextNProgress
        showOnShallow
        color={palette.primary.main}
        height={2}
        options={{ showSpinner: false }}
      />
      {authenticatedUser?.accountSignupComplete ? <CommandBar /> : null}
      {children}
    </>
  );
};
