import type { ReactElement } from "react";

import { PlainLayout } from "./plain-layout";

export const getPlainLayout = (page: ReactElement) => {
  return <PlainLayout>{page}</PlainLayout>;
};
