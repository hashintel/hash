import { requiredContext } from "../../../../../shared/required-context";

import type { Color } from "@hashintel/petrinaut-core";

export const [TypePropertiesContext, useTypePropertiesContext] =
  requiredContext<{ type: Color }>("TypeProperties");
