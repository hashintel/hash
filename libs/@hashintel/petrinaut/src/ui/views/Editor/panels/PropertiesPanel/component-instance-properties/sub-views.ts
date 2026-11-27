import {
  ComponentInstanceIcon,
  ComponentInstanceMainContent,
  ComponentInstanceTitle,
  DeleteComponentInstanceAction,
} from "./subviews/main";

import type { SubView } from "../../../../../sub-view/types";

export const componentInstanceSubViews: SubView[] = [
  {
    id: "component-instance-main-content",
    title: "Component Instance",
    icon: ComponentInstanceIcon,
    main: true,
    titleComponent: ComponentInstanceTitle,
    component: ComponentInstanceMainContent,
    headerAction: DeleteComponentInstanceAction,
    headerActionMutates: true,
  },
];
