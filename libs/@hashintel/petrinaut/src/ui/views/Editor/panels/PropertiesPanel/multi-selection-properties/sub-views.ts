import {
  DeleteSelectionAction,
  MultipleIcon,
  MultiSelectionContent,
} from "./subviews/main";

import type { SubView } from "../../../../../components/sub-view/types";

export const multiSelectionSubViews: SubView[] = [
  {
    id: "multi-selection-main",
    title: "Multiple Selection",
    icon: MultipleIcon,
    main: true,
    component: MultiSelectionContent,
    headerAction: DeleteSelectionAction,
    headerActionMutates: true,
  },
];
