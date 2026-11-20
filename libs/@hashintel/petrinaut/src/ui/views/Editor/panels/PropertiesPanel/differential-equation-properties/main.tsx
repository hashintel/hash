import { VerticalSubViewsContainer } from "../../../../../components/sub-view/vertical/vertical-sub-views-container";
import { DiffEqPropertiesContext } from "./context";
import { diffEqMainContentSubView } from "./subviews/main";

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
}

export const DifferentialEquationProperties: React.FC<
  DifferentialEquationPropertiesProps
> = ({ differentialEquation, types, places }) => {
  const subViews: SubView[] = [
    {
      ...diffEqMainContentSubView,
      title: `${diffEqMainContentSubView.title} ${differentialEquation.name}`,
    },
  ];

  return (
    <DiffEqPropertiesContext value={{ differentialEquation, types, places }}>
      <VerticalSubViewsContainer
        key={differentialEquation.id}
        name="diff-eq-properties"
        subViews={subViews}
      />
    </DiffEqPropertiesContext>
  );
};
