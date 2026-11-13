import type { ReactNode } from "react";

const label = "all";

/** The mark of something that holds in every overload, drawn as an overload's number is. A list shows it once another of its items holds in some overloads only. */
export function EveryOverload(): ReactNode {
  return (
    <span className="api-overloads">
      <span className="api-overload" aria-label="Every overload">
        {label}
      </span>
    </span>
  );
}
