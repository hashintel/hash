/**
 * One slide on screen. A TSX slide draws its own `Slide`; an MDX slide is
 * prose, so the deck puts it in a `Slide` with the theme's text styles,
 * its body at the top or centred under its heading, or, on a title slide,
 * under the talk's title, subtitle and author.
 */

import { Slide } from "../slide";
import { TitleSlide } from "../title-slide";

import type { LoadedSlide } from "../slide-module";

export const SlideContent = ({ slide }: { slide: LoadedSlide }) => {
  const { Content, layout } = slide;
  if (slide.kind === "tsx") {
    return <Content />;
  }
  if (layout.kind === "content") {
    return (
      <Slide
        className={
          layout.align === "center" ? "deck-mdx deck-mdx--centered" : "deck-mdx"
        }
      >
        <Content />
      </Slide>
    );
  }
  return (
    <TitleSlide
      title={slide.title}
      subtitle={layout.subtitle ?? undefined}
      author={layout.author ?? undefined}
    >
      <Content />
    </TitleSlide>
  );
};
