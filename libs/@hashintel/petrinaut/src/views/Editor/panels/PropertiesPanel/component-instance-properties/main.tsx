import { css } from "@hashintel/ds-helpers/css";

import type { SubView } from "../../../../../components/sub-view/types";
import { VerticalSubViewsContainer } from "../../../../../components/sub-view/vertical/vertical-sub-views-container";
import type {
  ComponentInstance,
  Subnet,
} from "../../../../../core/types/sdcpn";
import { ComponentInstancePropertiesContext } from "./context";
import { componentInstanceMainContentSubView } from "./subviews/main";

const containerStyle = css({
  display: "flex",
  flexDirection: "column",
  height: "[100%]",
  minHeight: "[0]",
});

const subViews: SubView[] = [componentInstanceMainContentSubView];

interface ComponentInstancePropertiesProps {
  instance: ComponentInstance;
  subnet: Subnet | null;
  updateComponentInstance: (
    instanceId: string,
    updateFn: (instance: ComponentInstance) => void,
  ) => void;
}

export const ComponentInstanceProperties: React.FC<
  ComponentInstancePropertiesProps
> = ({ instance, subnet, updateComponentInstance }) => {
  const subnetParameters = subnet?.parameters ?? [];

  const value = {
    instance,
    subnet,
    subnetParameters,
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
