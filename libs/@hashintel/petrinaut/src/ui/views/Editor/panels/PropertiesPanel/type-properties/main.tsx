import { css } from "@hashintel/ds-helpers/css";

import { VerticalSubViewsContainer } from "../../../../../components/sub-view/vertical/vertical-sub-views-container";
import { TypePropertiesContext } from "./context";
import { typeMainContentSubView } from "./subviews/main";

import type { MutationContextValue } from "../../../../../../react/state/mutation-context";
import type { SubView } from "../../../../../components/sub-view/types";
import type { Color } from "@hashintel/petrinaut-core";

const containerStyle = css({
  display: "flex",
  flexDirection: "column",
  height: "[100%]",
  minHeight: "[0]",
});

const subViews: SubView[] = [typeMainContentSubView];

interface TypePropertiesProps {
  type: Color;
  updateType: MutationContextValue["updateType"];
  addTypeElement: MutationContextValue["addTypeElement"];
  updateTypeElement: MutationContextValue["updateTypeElement"];
  removeTypeElement: MutationContextValue["removeTypeElement"];
  moveTypeElement: MutationContextValue["moveTypeElement"];
}

export const TypeProperties: React.FC<TypePropertiesProps> = ({
  type,
  updateType,
  addTypeElement,
  updateTypeElement,
  removeTypeElement,
  moveTypeElement,
}) => {
  const value = {
    type,
    updateType,
    addTypeElement,
    updateTypeElement,
    removeTypeElement,
    moveTypeElement,
  };

  return (
    <div className={containerStyle}>
      <TypePropertiesContext value={value}>
        <VerticalSubViewsContainer name="type-properties" subViews={subViews} />
      </TypePropertiesContext>
    </div>
  );
};
