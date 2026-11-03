/**
 * One slide on screen. A TSX slide draws its own `Slide`; an MDX slide is
 * prose, so the deck puts it in a `Slide` with the theme's text styles.
 */

import { Slide } from "../slide";

import type { LoadedSlide } from "../slide-module";

export const SlideContent = ({ slide }: { slide: LoadedSlide }) => {
  const { Content } = slide;
  return slide.kind === "mdx" ? (
    <Slide className="deck-mdx">
      <Content />
    </Slide>
  ) : (
    <Content />
  );
};
