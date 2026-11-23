import { requiredContext } from "../../../../../../react/required-context";

import type { Color } from "@hashintel/petrinaut-core";

export const [TypePropertiesContext, useTypePropertiesContext] =
  requiredContext<{ type: Color }>("TypeProperties");
