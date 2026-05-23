import { PlainLayout } from "./plain-layout";

import type { ReactElement } from "react";

export const getPlainLayout = (page: ReactElement) => {
  return <PlainLayout>{page}</PlainLayout>;
};
