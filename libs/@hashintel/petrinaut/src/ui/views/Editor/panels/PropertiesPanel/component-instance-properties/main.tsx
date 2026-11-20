import { VerticalSubViewsContainer } from "../../../../../components/sub-view/vertical/vertical-sub-views-container";
import { ComponentInstancePropertiesContext } from "./context";
import { componentInstanceMainContentSubView } from "./subviews/main";

import type { SubView } from "../../../../../components/sub-view/types";
import type {
  Component,
  ComponentInstance,
  PetrinautMutations,
} from "@hashintel/petrinaut-core";

const subViews: SubView[] = [componentInstanceMainContentSubView];

export const ComponentInstanceProperties: React.FC<{
  instance: ComponentInstance;
  component: Component | null;
  updateComponentInstance: PetrinautMutations["updateComponentInstance"];
}> = ({ instance, component, updateComponentInstance }) => {
  const value = {
    instance,
    component,
    componentParameters: component?.parameters ?? [],
    updateComponentInstance,
  };

  return (
    <ComponentInstancePropertiesContext value={value}>
      <VerticalSubViewsContainer
        name="component-instance-properties"
        subViews={subViews}
      />
    </ComponentInstancePropertiesContext>
  );
};
