import { css } from "@hashintel/ds-helpers/css";

import { VerticalSubViewsContainer } from "../../../../../components/sub-view/vertical/vertical-sub-views-container";
import { TypePropertiesContext } from "./context";
import { typeMainContentSubView } from "./subviews/main";

import type { PetrinautMutations } from "../../../../../../react";
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
  updateType: PetrinautMutations["updateType"];
  addTypeElement: PetrinautMutations["addTypeElement"];
  updateTypeElement: PetrinautMutations["updateTypeElement"];
  removeTypeElement: PetrinautMutations["removeTypeElement"];
  moveTypeElement: PetrinautMutations["moveTypeElement"];
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
