import { type IconName } from "../Icon/icon";

import type { FormInputSize } from "../../util/form-shared";
import type { ExclusifyUnion } from "type-fest";

export type Item = {
  id: string;

  text: React.ReactNode;
  description?: React.ReactNode;
  icon?: IconName;
  loading?: boolean;

  indent?: number;
  disabled?: boolean;
  tone?: "neutral" | "brand" | "error";
  selectedStyle?: "none" | "tick" | "checkbox" | "radio" | "highlight";

  subActions?: ItemOrGroup;
} & ExclusifyUnion<
  | {
      href: string;
      target?: "_blank";
    }
  | {
      onClick: (id: string) => void;
    }
>;

export type ItemOrGroup =
  | Item
  | {
      id: string;
      label: React.ReactNode;
      items: Item[];
    };

export const SelectableList = ({
  className,
  items,
  selected,
  size,
  onHighlight,
  emptyState,
}: {
  className?: string;
  items?: Array<ItemOrGroup>;
  size?: FormInputSize;
  selected?: string[];
  onHighlight?: (id: string) => void;
  emptyState?: React.ReactNode;
}) => {
  return <div className={className} />;
};
