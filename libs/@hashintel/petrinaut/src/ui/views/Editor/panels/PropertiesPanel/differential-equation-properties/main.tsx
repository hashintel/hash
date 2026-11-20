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

interface DifferentialEquationPropertiesProps {
  differentialEquation: DifferentialEquation;
  types: Color[];
  places: Place[];
  updateDifferentialEquation: PetrinautMutations["updateDifferentialEquation"];
}

export const DifferentialEquationProperties: React.FC<
  DifferentialEquationPropertiesProps
> = ({ differentialEquation, types, places, updateDifferentialEquation }) => {
  const subViews: SubView[] = [
    {
      ...diffEqMainContentSubView,
      title: `${diffEqMainContentSubView.title} ${differentialEquation.name}`,
    },
  ];
  const value = {
    differentialEquation,
    types,
    places,
    updateDifferentialEquation,
  };

  return (
    <DiffEqPropertiesContext value={value}>
      <VerticalSubViewsContainer
        key={differentialEquation.id}
        name="diff-eq-properties"
        subViews={subViews}
      />
    </DiffEqPropertiesContext>
  );
};
