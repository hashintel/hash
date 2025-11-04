import { addons } from "storybook/manager-api";

import { themes } from "./themes";

addons.setConfig({
  theme: themes.light,
});
