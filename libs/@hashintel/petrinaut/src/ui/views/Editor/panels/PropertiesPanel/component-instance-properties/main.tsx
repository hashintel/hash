import { VerticalSubViewsContainer } from "../../../../../components/sub-view/vertical/vertical-sub-views-container";
import { ComponentInstancePropertiesContext } from "./context";
import { componentInstanceSubViews } from "./sub-views";

import type { Component, ComponentInstance } from "@hashintel/petrinaut-core";

export const ComponentInstanceProperties: React.FC<{
  instance: ComponentInstance;
  component: Component | null;
}> = ({ instance, component }) => (
  <ComponentInstancePropertiesContext value={{ instance, component }}>
    <VerticalSubViewsContainer
      name="component-instance-properties"
      subViews={componentInstanceSubViews}
    />
  </ComponentInstancePropertiesContext>
);
