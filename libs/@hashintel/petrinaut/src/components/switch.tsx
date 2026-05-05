import { Switch as DsSwitch } from "@hashintel/ds-components";

import { withTooltip } from "./hoc/with-tooltip";

export const Switch = withTooltip(DsSwitch, "inline");
