import { ParameterIcon } from "../../../../../constants/entity-icons";
import { ParameterMainContent } from "./subviews/main";

import type { SubView } from "../../../../../sub-view/types";

export const parameterSubViews: SubView[] = [
  {
    id: "parameter-main-content",
    title: "Parameter",
    icon: ParameterIcon,
    main: true,
    component: ParameterMainContent,
  },
];
