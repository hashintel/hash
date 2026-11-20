import { VerticalSubViewsContainer } from "../../../../../components/sub-view/vertical/vertical-sub-views-container";
import { ParameterPropertiesContext } from "./context";
import { parameterMainContentSubView } from "./subviews/main";

import type { SubView } from "../../../../../components/sub-view/types";
import type { Parameter } from "@hashintel/petrinaut-core";

const subViews: SubView[] = [parameterMainContentSubView];

interface ParameterPropertiesProps {
  parameter: Parameter;
}

export const ParameterProperties: React.FC<ParameterPropertiesProps> = ({
  parameter,
}) => (
  <ParameterPropertiesContext value={{ parameter }}>
    <VerticalSubViewsContainer
      name="parameter-properties"
      subViews={subViews}
    />
  </ParameterPropertiesContext>
);
