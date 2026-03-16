import { css } from "@hashintel/ds-helpers/css";
import { LuTreePine } from "react-icons/lu";

import type { SubView } from "../../../../../components/sub-view/types";

const emptyStyle = css({
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  flex: "1",
  fontSize: "sm",
  color: "neutral.s65",
  padding: "4",
});

const EntitiesTreeContent: React.FC = () => {
  return <div className={emptyStyle}>Entities tree coming soon</div>;
};

export const entitiesTreeSubView: SubView = {
  id: "entities-tree",
  title: "Entities",
  icon: LuTreePine,
  main: true,
  component: EntitiesTreeContent,
};
