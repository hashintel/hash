import { css } from "@hashintel/ds-helpers/css";

import { VerticalSubViewsContainer } from "../../../../../components/sub-view/vertical/vertical-sub-views-container";
import { ParameterPropertiesContext } from "./context";
import { parameterMainContentSubView } from "./subviews/main";

import type { PetrinautMutations } from "../../../../../../react";
import type { SubView } from "../../../../../components/sub-view/types";
import type { Parameter } from "@hashintel/petrinaut-core";

const containerStyle = css({
  display: "flex",
  flexDirection: "column",
  height: "[100%]",
  minHeight: "[0]",
});

const subViews: SubView[] = [parameterMainContentSubView];

interface ParameterPropertiesProps {
  parameter: Parameter;
  updateParameter: PetrinautMutations["updateParameter"];
}

export const ParameterProperties: React.FC<ParameterPropertiesProps> = ({
  parameter,
  updateParameter,
}) => {
  const value = { parameter, updateParameter };

  return (
    <div className={containerStyle}>
      <ParameterPropertiesContext value={value}>
        <VerticalSubViewsContainer
          name="parameter-properties"
          subViews={subViews}
        />
      </ParameterPropertiesContext>
    </div>
  );
};
