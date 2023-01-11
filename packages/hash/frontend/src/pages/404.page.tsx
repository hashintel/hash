import NextErrorComponent, { ErrorProps } from "next/error";

import { getLayoutWithHeader, NextPageWithLayout } from "../shared/layout";

const NotFoundPage: NextPageWithLayout<ErrorProps> = () => {
  return <NextErrorComponent statusCode={404} />;
};

NotFoundPage.getLayout = getLayoutWithHeader;

export default NotFoundPage;
