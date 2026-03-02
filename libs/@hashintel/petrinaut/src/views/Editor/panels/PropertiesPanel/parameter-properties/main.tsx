import { css } from "@hashintel/ds-helpers/css";

import type { SubView } from "../../../../../components/sub-view/types";
import { VerticalSubViewsContainer } from "../../../../../components/sub-view/vertical/vertical-sub-views-container";
import type { Parameter } from "../../../../../core/types/sdcpn";
import { ParameterPropertiesContext } from "./context";
import { parameterMainContentSubView } from "./subviews/main";

const containerStyle = css({
  display: "flex",
  flexDirection: "column",
  height: "[100%]",
  minHeight: "[0]",
});

const subViews: SubView[] = [parameterMainContentSubView];

interface ParameterPropertiesProps {
  parameter: Parameter;
  updateParameter: (
    parameterId: string,
    updateFn: (parameter: Parameter) => void,
  ) => void;
}

export const ParameterProperties: React.FC<ParameterPropertiesProps> = ({
  parameter,
  updateParameter,
}) => {
  const value = { parameter, updateParameter };

  return (
    <div className={containerStyle}>
      <ParameterPropertiesContext.Provider value={value}>
        <VerticalSubViewsContainer subViews={subViews} />
      </ParameterPropertiesContext.Provider>
    </div>
  );
};
