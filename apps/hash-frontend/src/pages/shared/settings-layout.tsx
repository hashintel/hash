import { SettingsLayout } from "./settings-layout/settings-layout";

import type { ReactElement } from "react";

export const getSettingsLayout = (page: ReactElement) => {
  return <SettingsLayout>{page}</SettingsLayout>;
};
