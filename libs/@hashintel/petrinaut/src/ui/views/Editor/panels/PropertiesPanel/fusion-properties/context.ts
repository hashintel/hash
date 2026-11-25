import { requiredContext } from "../../../../../shared/required-context";

import type { Fusion } from "@hashintel/petrinaut-core";

export const [FusionContext, useFusion] =
  requiredContext<Fusion>("FusionProperties");
