import { addons } from "storybook/manager-api";

import { themes } from "./themes";
import { getPreferredColorScheme } from "./utils";

addons.setConfig({
  theme: themes[getPreferredColorScheme()],
});
