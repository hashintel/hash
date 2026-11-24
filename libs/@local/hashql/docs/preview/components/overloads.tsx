import type { ReactNode } from "react";

/** The numbers of the overloads something holds in, each drawn in a small square as the signatures number their overloads. */
export function Overloads({
  numbers,
}: {
  readonly numbers: readonly number[];
}): ReactNode {
  return (
    <span className="api-overloads">
      {numbers.map((number) => (
        <span
          className="api-overload"
          key={number}
          aria-label={`Overload ${number}`}
        >
          {number}
        </span>
      ))}
    </span>
  );
}
