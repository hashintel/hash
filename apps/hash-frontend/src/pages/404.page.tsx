import type { ErrorProps } from "next/error";

import type { NextPageWithLayout } from "../shared/layout";
import { getLayoutWithHeader } from "../shared/layout";
import { NotFound } from "./shared/not-found";

const NotFoundPage: NextPageWithLayout<ErrorProps> = () => {
  return <NotFound />;
};

NotFoundPage.getLayout = getLayoutWithHeader;

export default NotFoundPage;
