import { VerticalSubViewsContainer } from "../../../../../components/sub-view/vertical/vertical-sub-views-container";
import { TypePropertiesContext } from "./context";
import { typeMainContentSubView } from "./subviews/main";

import type { SubView } from "../../../../../components/sub-view/types";
import type { Color } from "@hashintel/petrinaut-core";

const subViews: SubView[] = [typeMainContentSubView];

export const TypeProperties: React.FC<{ type: Color }> = ({ type }) => (
  <TypePropertiesContext value={{ type }}>
    <VerticalSubViewsContainer name="type-properties" subViews={subViews} />
  </TypePropertiesContext>
);
