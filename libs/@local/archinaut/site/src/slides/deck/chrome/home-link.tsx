/** Back to the deck list, shown when the pointer comes near the top-right corner. */

import { Link } from "@tanstack/react-router";
import { useRef } from "react";

import { GridIcon } from "@hashintel/ds-icons";

import { usePointerProximity } from "./use-pointer-proximity";

export const HomeLink = ({ title }: { title: string }) => {
  const ref = useRef<HTMLAnchorElement>(null);
  const near = usePointerProximity(ref);
  return (
    <Link
      ref={ref}
      to="/slides"
      className="deck-home-link"
      data-near={near}
      aria-label="Choose another deck"
    >
      <span>{title}</span>
      <GridIcon size={14} />
    </Link>
  );
};
