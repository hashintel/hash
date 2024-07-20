import NextErrorComponent, type { ErrorProps } from "next/error";
import type { NextPageWithLayout , getLayoutWithHeader } from "../shared/layout";

const NotFoundPage: NextPageWithLayout<ErrorProps> = () => {
  return <NextErrorComponent statusCode={404} />;
};

NotFoundPage.getLayout = getLayoutWithHeader;

export default NotFoundPage;
