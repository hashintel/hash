import { requiredContext } from "../../../../../../react/required-context";

import type { Parameter } from "@hashintel/petrinaut-core";

export const [ParameterPropertiesContext, useParameterPropertiesContext] =
  requiredContext<{ parameter: Parameter }>("ParameterProperties");
