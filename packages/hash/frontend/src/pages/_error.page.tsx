import * as Sentry from "@sentry/nextjs";
import NextErrorComponent, { ErrorProps } from "next/error";
import { getLayoutWithHeader, NextPageWithLayout } from "../shared/layout";

const CustomErrorPage: NextPageWithLayout<ErrorProps> = ({ statusCode }) => {
  return <NextErrorComponent statusCode={statusCode} />;
};

CustomErrorPage.getInitialProps = async (contextData) => {
  await Sentry.captureUnderscoreErrorException(contextData);
  return NextErrorComponent.getInitialProps(contextData);
};

CustomErrorPage.getLayout = getLayoutWithHeader;

export default CustomErrorPage;
