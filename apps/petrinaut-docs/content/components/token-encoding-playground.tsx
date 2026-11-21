/**
 * The token encoding playground, as a page embeds it: the reader declares the
 * dimensions of a token type, writes one token, and reads the bytes Petrinaut
 * Core packs it into.
 *
 * This file is all a page loads with the figure. The playground and the part
 * of the engine it runs arrive when the figure first comes near the viewport,
 * so a reader who never scrolls to it downloads neither.
 */

import "./diagram.css";
import { lazy, Suspense, useState } from "react";

/**
 * Stands in for the playground when its code cannot be fetched. Reloading is
 * a button, since the site routes a link inside a page without a reload.
 */
const LoadFailed = () => (
  <p className="pnd-box-note">
    The playground could not load.{" "}
    <button type="button" onClick={() => window.location.reload()}>
      Reload the page
    </button>{" "}
    to try again.
  </p>
);

/**
 * The playground, or `LoadFailed` when the request for its code fails: the
 * reader is offline, or a newer deployment has replaced the file. Resolving
 * to a component keeps the failure inside the figure. A rejection would reach
 * the boundary of the whole page and replace the guide the reader is in.
 */
const Playground = lazy(async () => {
  try {
    const { Playground: component } =
      await import("./token-encoding-playground/playground");
    return { default: component };
  } catch {
    return { default: LoadFailed };
  }
});

/** How far outside the viewport the figure is when its code starts to load. */
const loadMargin = "400px";

const placeholder = <p className="pnd-box-note">Loading the playground…</p>;

export const TokenEncodingPlayground = () => {
  const [isNear, setIsNear] = useState(false);

  /** Watches the figure until it first comes near the viewport. */
  const watch = (figure: HTMLElement) => {
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setIsNear(true);
          observer.disconnect();
        }
      },
      { rootMargin: loadMargin },
    );
    observer.observe(figure);
    return () => observer.disconnect();
  };

  return (
    <figure className="pnd" ref={watch}>
      <figcaption className="pnd-title">Token encoding playground</figcaption>
      <Suspense fallback={placeholder}>
        {isNear ? <Playground /> : placeholder}
      </Suspense>
    </figure>
  );
};
