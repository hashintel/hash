import { VerticalSubViewsContainer } from "../../../../../components/sub-view/vertical/vertical-sub-views-container";
import { ComponentInstancePropertiesContext } from "./context";
import { componentInstanceMainContentSubView } from "./subviews/main";

import type { SubView } from "../../../../../components/sub-view/types";
import type { Component, ComponentInstance } from "@hashintel/petrinaut-core";

const subViews: SubView[] = [componentInstanceMainContentSubView];

export const ComponentInstanceProperties: React.FC<{
  instance: ComponentInstance;
  component: Component | null;
}> = ({ instance, component }) => (
  <ComponentInstancePropertiesContext value={{ instance, component }}>
    <VerticalSubViewsContainer
      name="component-instance-properties"
      subViews={subViews}
    />
  </ComponentInstancePropertiesContext>
);
