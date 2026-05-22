import { css } from "@hashintel/ds-helpers/css";

import { VerticalSubViewsContainer } from "../../../../../components/sub-view/vertical/vertical-sub-views-container";
import { DiffEqPropertiesContext } from "./context";
import { diffEqMainContentSubView } from "./subviews/main";

import type { PetrinautMutations } from "../../../../../../react";
import type { SubView } from "../../../../../components/sub-view/types";
import type {
  Color,
  DifferentialEquation,
  Place,
} from "@hashintel/petrinaut-core";

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
  updateDifferentialEquation: PetrinautMutations["updateDifferentialEquation"];
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
