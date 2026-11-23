import { VerticalSubViewsContainer } from "../../../../../sub-view/vertical-sub-views-container";
import { TypePropertiesContext } from "./context";
import { typeSubViews } from "./sub-views";

import type { Color } from "@hashintel/petrinaut-core";

export const TypeProperties: React.FC<{ type: Color }> = ({ type }) => (
  <TypePropertiesContext value={{ type }}>
    <VerticalSubViewsContainer name="type-properties" subViews={typeSubViews} />
  </TypePropertiesContext>
);
