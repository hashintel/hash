import type { FormInputSize } from "../../util/form-shared";
import type { IconName } from "../Icon/icon";
import type { Tooltip } from "../Tooltip/tooltip";

type BreadcrumbItem = {
  label: React.ReactNode;
  iconName?: IconName;
  onEdit?: (label: string) => void;
  tooltip?: string;
  testId?: string;
  tooltipOptions?: Omit<
    React.ComponentProps<typeof Tooltip>,
    "children" | "content"
  >;
} & ({ href: string } | { onClick: () => void });

export const BreadCrumbs = (_props: {
  className?: string;
  items: BreadcrumbItem[];
  size?: FormInputSize;
  maxItems?: number;
}) => {
  return <div />;
};
