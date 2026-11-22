/**
 * The component that draws each kind of node, for the compact cards and for
 * the classic shapes. Every component here follows the rule of `node-fade.ts`
 * for what it draws: `faded-node-parts.test.tsx` renders each one.
 */

import { ClassicPlaceNode } from "./classic-place-node";
import { ClassicTransitionNode } from "./classic-transition-node";
import { ComponentInstanceNode } from "./component-instance-node";
import { PlaceNode } from "./place-node";
import { TransitionNode } from "./transition-node";

export const compactNodeTypes = {
  place: PlaceNode,
  transition: TransitionNode,
  componentInstance: ComponentInstanceNode,
};

export const classicNodeTypes = {
  place: ClassicPlaceNode,
  transition: ClassicTransitionNode,
  componentInstance: ComponentInstanceNode,
};
