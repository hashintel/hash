/**
 * Renders a plain string, turning `backticked` spans into `<code>`.
 *
 * Diagram components take strings rather than nodes on purpose. JSX written
 * inside MDX is compiled by the host's MDX renderer — Astro's, here — and
 * handing that to a React component fails at render time with "Objects are not
 * valid as a React child". Strings avoid the interop entirely, which also means
 * a host embedding the bundle needs no special MDX/JSX configuration.
 *
 * Backticks are the one piece of formatting these diagrams actually need, so
 * they are supported directly rather than by accepting arbitrary markup.
 */

import type { ReactElement } from "react";

export const Inline = ({ text }: { text: string }): ReactElement => (
  <>
    {text.split("`").map((part, index) =>
      // Odd indices are the spans that sat between a pair of backticks.
      index % 2 === 1 ? (
        <code key={index}>{part}</code>
      ) : (
        <span key={index}>{part}</span>
      ),
    )}
  </>
);
