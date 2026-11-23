import { ArcIcon, ArcMainContent, DeleteArcAction } from "./subviews/main";

import type { SubView } from "../../../../../sub-view/types";

export const arcSubViews: SubView[] = [
  {
    id: "arc-main-content",
    title: "Arc",
    icon: ArcIcon,
    main: true,
    component: ArcMainContent,
    headerAction: DeleteArcAction,
    headerActionMutates: true,
  },
];
