import { requiredContext } from "../../../../../shared/required-context";

import type { Parameter } from "@hashintel/petrinaut-core";

export const [ParameterPropertiesContext, useParameterPropertiesContext] =
  requiredContext<{ parameter: Parameter }>("ParameterProperties");
