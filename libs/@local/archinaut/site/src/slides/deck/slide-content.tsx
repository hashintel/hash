/**
 * One slide on screen. A TSX slide draws its own `Slide`; an MDX slide is
 * prose, so the deck puts it in a `Slide` with the theme's text styles, or,
 * on a title slide, under the talk's title, subtitle and author.
 */

import { Slide } from "../slide";

import type { LoadedSlide } from "../slide-module";

export const SlideContent = ({ slide }: { slide: LoadedSlide }) => {
  const { Content, layout } = slide;
  if (slide.kind === "tsx") {
    return <Content />;
  }
  if (layout.kind === "content") {
    return (
      <Slide className="deck-mdx">
        <Content />
      </Slide>
    );
  }
  return (
    <Slide className="deck-mdx deck-title">
      <h1 className="deck-title__title">{slide.title}</h1>
      {layout.subtitle === null ? null : (
        <p className="deck-title__subtitle">{layout.subtitle}</p>
      )}
      <div className="deck-title__body">
        <Content />
      </div>
      {layout.author === null ? null : (
        <p className="deck-title__author">{layout.author}</p>
      )}
    </Slide>
  );
};
