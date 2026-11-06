import { Function } from "effect";
import { Children, isValidElement } from "react";

import type { ReactNode } from "react";

/** Children split into the ones that fill a slot and the rest. */
interface Slotted {
  readonly slot: ReactNode[];
  readonly rest: ReactNode[];
}

/** `children` split into the ones that fill the slot `slot` and the rest. */
export const slotted: {
  (slot: string): (children: ReactNode) => Slotted;
  (children: ReactNode, slot: string): Slotted;
} = Function.dual(2, (children: ReactNode, slot: string): Slotted => {
  // oxlint-disable-next-line react/no-react-children -- the children are the elements the extraction writes, some of which name a slot
  const all = Children.toArray(children);
  const isSlotted = (child: ReactNode): boolean =>
    isValidElement<{ slot?: string }>(child) && child.props.slot === slot;

  return {
    slot: all.filter(isSlotted),
    rest: all.filter((child) => !isSlotted(child)),
  };
});
