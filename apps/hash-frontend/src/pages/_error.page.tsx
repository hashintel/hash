// Source: https://github.com/vercel/next.js/tree/0ab6ad52411b521f7d85178941268ea436ed9931/examples/with-sentry

import * as Sentry from "@sentry/nextjs";
import type { ErrorProps } from "next/error";
import NextErrorComponent from "next/error";

import type { NextPageWithLayout } from "../shared/layout";
import { getLayoutWithHeader } from "../shared/layout";

const CustomErrorPage: NextPageWithLayout<ErrorProps> = ({ statusCode }) => {
  return <NextErrorComponent statusCode={statusCode} />;
};

CustomErrorPage.getInitialProps = async (contextData) => {
  await Sentry.captureUnderscoreErrorException(contextData);
  return NextErrorComponent.getInitialProps(contextData);
};

CustomErrorPage.getLayout = getLayoutWithHeader;

export default CustomErrorPage;
