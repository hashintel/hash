import { css } from "@hashintel/ds-helpers/css";

import type { SubView } from "../../../../../components/sub-view/types";
import { VerticalSubViewsContainer } from "../../../../../components/sub-view/vertical/vertical-sub-views-container";
import type {
  Color,
  DifferentialEquation,
  Place,
} from "@hashintel/petrinaut-core/types/sdcpn";
import type { MutationContextValue } from "../../../../../../react/state/mutation-context";
import { DiffEqPropertiesContext } from "./context";
import { diffEqMainContentSubView } from "./subviews/main";

const containerStyle = css({
  display: "flex",
  flexDirection: "column",
  height: "[100%]",
  minHeight: "[0]",
});

const subViews: SubView[] = [diffEqMainContentSubView];

interface DifferentialEquationPropertiesProps {
  differentialEquation: DifferentialEquation;
  types: Color[];
  places: Place[];
  updateDifferentialEquation: MutationContextValue["updateDifferentialEquation"];
}

export const DifferentialEquationProperties: React.FC<
  DifferentialEquationPropertiesProps
> = ({ differentialEquation, types, places, updateDifferentialEquation }) => {
  const value = {
    differentialEquation,
    types,
    places,
    updateDifferentialEquation,
  };

  return (
    <div className={containerStyle}>
      <DiffEqPropertiesContext value={value}>
        <VerticalSubViewsContainer
          name="diff-eq-properties"
          subViews={subViews}
        />
      </DiffEqPropertiesContext>
    </div>
  );
};
