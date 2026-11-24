import { css } from "@hashintel/ds-helpers/css";

import { VerticalSubViewsContainer } from "../../../../../components/sub-view/vertical/vertical-sub-views-container";
import { ComponentInstancePropertiesContext } from "./context";
import { componentInstanceMainContentSubView } from "./subviews/main";

import type { SubView } from "../../../../../components/sub-view/types";
import type {
  Component,
  ComponentInstance,
  PetrinautMutations,
} from "@hashintel/petrinaut-core";

const containerStyle = css({
  display: "flex",
  flexDirection: "column",
  height: "full",
  minHeight: "0",
});

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
    <div className={containerStyle}>
      <ComponentInstancePropertiesContext value={value}>
        <VerticalSubViewsContainer
          name="component-instance-properties"
          subViews={subViews}
        />
      </ComponentInstancePropertiesContext>
    </div>
  );
};
