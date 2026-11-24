import { VerticalSubViewsContainer } from "../../../../../sub-view/vertical-sub-views-container";
import { DiffEqPropertiesContext } from "./context";
import { diffEqMainSubView } from "./sub-views";

import type { SubView } from "../../../../../sub-view/types";
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
      ...diffEqMainSubView,
      title: `${diffEqMainSubView.title} ${differentialEquation.name}`,
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
