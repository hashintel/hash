import type { ErrorProps } from "next/error";
import { NextSeo } from "next-seo";

import type { NextPageWithLayout } from "../shared/layout";
import { getLayoutWithHeader } from "../shared/layout";
import { NotFound } from "./shared/not-found";

const NotFoundPage: NextPageWithLayout<ErrorProps> = () => {
  return (
    <>
      <NextSeo title="This page could not be found" noindex />
      <NotFound />
    </>
  );
};

NotFoundPage.getLayout = getLayoutWithHeader;

export default NotFoundPage;
