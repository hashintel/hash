import * as Sentry from "@sentry/react";
import NextErrorComponent from "next/error";

import { getLayoutWithHeader } from "../shared/layout";

import type { NextPageWithLayout } from "../shared/layout";
import type { ErrorProps } from "next/error";

const CustomErrorPage: NextPageWithLayout<ErrorProps> = ({ statusCode }) => {
  return <NextErrorComponent statusCode={statusCode} />;
};

CustomErrorPage.getInitialProps = async (contextData) => {
  if (contextData.err) {
    Sentry.captureException(contextData.err);
    await Sentry.flush(2000);
  }
  return NextErrorComponent.getInitialProps(contextData);
};

CustomErrorPage.getLayout = getLayoutWithHeader;

export default CustomErrorPage;
