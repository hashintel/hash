import { TokenTypeIcon } from "../../../../../shared/entity-icons";
import { TypeMainContent } from "./subviews/main";

import type { SubView } from "../../../../../sub-view/types";

export const typeSubViews: SubView[] = [
  {
    id: "type-main-content",
    title: "Type",
    icon: TokenTypeIcon,
    main: true,
    component: TypeMainContent,
  },
];
