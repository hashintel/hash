import { type IconName } from "../Icon/icon";

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
} & ExclusifyUnion<
  | {
      href: string;
      target?: "_blank";
    }
  | {
      onClick: (id: string) => void;
    }
  | {
      nestedItems?: ItemOrGroup<Item>;
    }
>;

export type ItemOrGroup<ItemType> =
  | ItemType
  | {
      id: string;
      label: React.ReactNode;
      items: ItemType[];
    };

export const isGroup = (
  entry: ItemOrGroup<Item>,
): entry is Extract<ItemOrGroup<Item>, { items: Item[] }> => "items" in entry;
