import { VerticalSubViewsContainer } from "../../../../../components/sub-view/vertical/vertical-sub-views-container";
import { ParameterPropertiesContext } from "./context";
import { parameterSubViews } from "./sub-views";

import type { Parameter } from "@hashintel/petrinaut-core";

interface ParameterPropertiesProps {
  parameter: Parameter;
}

export const ParameterProperties: React.FC<ParameterPropertiesProps> = ({
  parameter,
}) => (
  <ParameterPropertiesContext value={{ parameter }}>
    <VerticalSubViewsContainer
      name="parameter-properties"
      subViews={parameterSubViews}
    />
  </ParameterPropertiesContext>
);
