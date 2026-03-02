import { css } from "@hashintel/ds-helpers/css";

import type { SubView } from "../../../../../components/sub-view/types";
import { VerticalSubViewsContainer } from "../../../../../components/sub-view/vertical/vertical-sub-views-container";
import type { Color } from "../../../../../core/types/sdcpn";
import { TypePropertiesContext } from "./context";
import { typeMainContentSubView } from "./subviews/main";

const containerStyle = css({
  display: "flex",
  flexDirection: "column",
  height: "[100%]",
  minHeight: "[0]",
});

const subViews: SubView[] = [typeMainContentSubView];

interface TypePropertiesProps {
  type: Color;
  updateType: (typeId: string, updateFn: (type: Color) => void) => void;
}

export const TypeProperties: React.FC<TypePropertiesProps> = ({
  type,
  updateType,
}) => {
  const value = { type, updateType };

  return (
    <div className={containerStyle}>
      <TypePropertiesContext value={value}>
        <VerticalSubViewsContainer subViews={subViews} />
      </TypePropertiesContext>
    </div>
  );
};
