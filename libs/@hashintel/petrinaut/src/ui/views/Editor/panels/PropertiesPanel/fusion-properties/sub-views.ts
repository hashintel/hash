import { FusionIcon } from "../../../../../constants/entity-icons";
import {
  DeleteFusionAction,
  FusionMainContent,
  FusionTitle,
} from "./subviews/main";

import type { SubView } from "../../../../../components/sub-view/types";

export const fusionSubViews: SubView[] = [
  {
    id: "fusion-main-content",
    title: "Fusion",
    icon: FusionIcon,
    main: true,
    titleComponent: FusionTitle,
    component: FusionMainContent,
    headerAction: DeleteFusionAction,
    headerActionMutates: true,
  },
];
