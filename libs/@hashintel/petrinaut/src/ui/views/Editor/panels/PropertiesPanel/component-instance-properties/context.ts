import { requiredContext } from "../../../../../../react/required-context";

import type { Component, ComponentInstance } from "@hashintel/petrinaut-core";

export const [
  ComponentInstancePropertiesContext,
  useComponentInstancePropertiesContext,
] = requiredContext<{
  instance: ComponentInstance;
  component: Component | null;
}>("ComponentInstanceProperties");
