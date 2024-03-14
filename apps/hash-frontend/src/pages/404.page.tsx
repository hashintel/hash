import type { ErrorProps } from "next/error";
import NextErrorComponent from "next/error";

import type { NextPageWithLayout } from "../shared/layout";
import { getLayoutWithHeader } from "../shared/layout";

const NotFoundPage: NextPageWithLayout<ErrorProps> = () => {
  return <NextErrorComponent statusCode={404} />;
};

NotFoundPage.getLayout = getLayoutWithHeader;

export default NotFoundPage;
