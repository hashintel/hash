import { NextSeo } from "next-seo";

import { getLayoutWithHeader } from "../shared/layout";
import { NotFound } from "./shared/not-found";

import type { NextPageWithLayout } from "../shared/layout";
import type { ErrorProps } from "next/error";

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
