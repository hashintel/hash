import { Box } from "@mui/material";

import { NextPageWithLayout } from "../../shared/layout";
import { getSettingsLayout } from "./shared/settings-layout";

const SettingsPage: NextPageWithLayout = () => {
  return <Box />;
};

SettingsPage.getLayout = (page) => getSettingsLayout(page);
export default SettingsPage;
